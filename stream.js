const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { spawn } = require('child_process');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// 🚀 Multi-Stream Key Manager
const STREAM_KEYS = {
    '1': '14601603391083_14040893622891_puxzrwjniu', 
    '2': '14601696583275_14041072274027_apdzpdb5xi', 
    '3': '14617940008555_14072500914795_ohw67ls7ny',
    '4': '14601972227691_14041593547371_obdhgewlmq',
    '5': '15145825803883_15082736847467_hjyjq4bud4',
    '6': '15145851166315_15082784229995_mr5eweath4', 
    '7': '15145866042987_15082813393515_axt6r27f7m',
    '8': '15145878756971_15082836265579_oeowgtmnxu'
};

const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

let browser = null;
let ffmpegProcess = null;

// =========================================================================
// 🔄 MAIN LOOP
// =========================================================================
async function mainLoop() {
    while (true) {
        try {
            await startDirectStreaming();
        } catch (error) {
            console.error(`\n[!] ALERT: ${error.message}`);
            console.log('[*] 🔄 Restarting everything in 3 seconds...');
            await cleanup();
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

async function startDirectStreaming() {
    console.log(`[*] Starting browser and FFmpeg...`);
    const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
    browser = await puppeteer.launch({
        headless: false, 
        defaultViewport: { width: 1280, height: 720 },
        ignoreDefaultArgs: ['--enable-automation'], 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-gpu',           
            
            // 👇 YEH 3 NAYE FLAGS WAPAS ADD KIYE HAIN CRASH / BLACK SCREEN ROKNE KE LIYE 👇
            '--disable-software-rasterizer',   
            '--disable-accelerated-2d-canvas', 
            '--force-color-profile=srgb',      

            '--window-size=1280,720',
            '--kiosk', 
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    const page = await browser.newPage();
    const pages = await browser.pages();
    for (const p of pages) {
        if (p !== page) await p.close();
    }

    // 🛑 POPUP & REDIRECT BLOCKER
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== page) {
                    console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
                    await page.bringToFront(); 
                    await newPage.close();
                }
            } catch (e) {}
        }
    });

    console.log(`[*] Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 🎥 1. START 30-SEC DEBUG RECORDING
    const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
    console.log('[*] 🔴 Debug Recording Started...');
    await recorder.start('./recording.mp4');

    await new Promise(r => setTimeout(r, 5000));

    // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
    console.log('[*] Hunting for the JW Player Play Button...');
    let buttonGone = false;
    let attempts = 0;
    
    while (!buttonGone && attempts < 10) {
        buttonGone = true;
        for (const frame of page.frames()) {
            try {
                const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
                if (playBtn) {
                    const isVisible = await frame.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    }, playBtn);

                    if (isVisible) {
                        buttonGone = false;
                        console.log(`[*] Play button detected! Smashing it...`);
                        await frame.evaluate(el => el.click(), playBtn); 
                        await new Promise(r => setTimeout(r, 2000));
                        break; 
                    }
                }
            } catch (err) {}
        }
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
    }

    // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (One Time Auto-Click)
    console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
    let unmuteClicked = false;
    let unmuteAttempts = 0;

    while (!unmuteClicked && unmuteAttempts < 15) {
        for (const frame of page.frames()) {
            try {
                const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
                if (unmuteBtn) {
                    const isVisible = await frame.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        const parentStyle = window.getComputedStyle(el.parentElement);
                        return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
                    }, unmuteBtn);

                    if (isVisible) {
                        console.log(`[*] Unmute button found! Waiting like a human before clicking...`);
                        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
                        await frame.evaluate(el => el.click(), unmuteBtn); 
                        console.log(`[+] Successfully clicked UNMUTE! Proceeding...`);
                        
                        unmuteClicked = true;
                        
                        await new Promise(r => setTimeout(r, 2000));
                        await page.bringToFront();
                        break; 
                    }
                }
            } catch (err) {}
        }
        if (unmuteClicked) break; 
        unmuteAttempts++;
        await new Promise(r => setTimeout(r, 1000));
    }

    // 🧠 3. THE SMART SCANNER 
    console.log('[*] Scanning iframes for the REAL Live Stream Video...');
    let targetFrame = null;
    for (const frame of page.frames()) {
        try {
            const isRealLiveStream = await frame.evaluate(() => {
                const vid = document.querySelector('video');
                if (!vid) return false;
                if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
                return true; 
            });

            if (isRealLiveStream) {
                targetFrame = frame;
                console.log(`[+] Smart Scanner locked onto video frame...`);
                break; 
            }
        } catch (e) { }
    }

    if (!targetFrame) {
        console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
        targetFrame = page.mainFrame();
    }

    // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
    console.log('[*] Enforcing Black Background and Full Screen UI...');
    await page.evaluate(() => {
        document.body.style.backgroundColor = 'black';
        document.body.style.overflow = 'hidden';
        document.querySelectorAll('iframe').forEach(iframe => {
            iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
            iframe.style.width = '100vw'; iframe.style.height = '100vh';
            iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
        });
    }).catch(() => {});

    await targetFrame.evaluate(async () => {
        const style = document.createElement('style');
        style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
        document.head.appendChild(style);

        const video = document.querySelector('video');
        if (video) { 
            video.muted = false; 
            video.volume = 1.0; 
            video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
            video.style.width = '100vw'; video.style.height = '100vh';
            video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
        }
    }).catch(()=>{});

    // 📡 5. START FFMPEG BROADCAST (UPDATED AUDIO/VIDEO SYNC)
    console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
    let vfScale, bv, maxrate, bufsize, ba;

    if (streamQuality.includes('50KBps')) {
        vfScale = 'scale=640:360';
        bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
    } else if (streamQuality.includes('30KBps')) {
        vfScale = 'scale=426:240';
        bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
    } else {
        vfScale = 'scale=854:480';
        bv = '800k'; maxrate = '850k'; bufsize = '1700k'; ba = '64k';
    }

    const displayNum = process.env.DISPLAY || ':99';
    let ffmpegArgs = [
        '-y', 
        '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
        '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
        '-i', displayNum, 
        
        // 👉 A/V SYNC FIX: Value 0.8 se barha kar 1.4 kar di hai!
        // Agar ab bhi 19-20 ka farq lage toh isay '2.0' kar lena.
        '-itsoffset', '1.25', 
        
        '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
        '-f', 'pulse', '-i', 'default',
        
        '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
        '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
        '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
        // Drift bachane ke liye sirf aresample rakha hai
        '-af', 'aresample=async=1000', 
        
        '-f', 'flv', RTMP_DESTINATION 
    ];
    
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    ffmpegProcess.stderr.on('data', (data) => {
        if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
    });

    // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
    console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
    await new Promise(r => setTimeout(r, 30000));
    await recorder.stop();
    console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

    // 🧠 7. THE SMART WATCHDOG (With Anti-Pause capability)
    console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
    while (true) {
        if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

        const status = await targetFrame.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
            const v = document.querySelector('video');
            if (!v || v.ended) return 'DEAD';
            
            if (v.paused) {
                console.log("Video was paused! Forcing it back to play...");
                v.play().catch(()=>{});
                return 'PAUSED_AND_RECOVERED';
            }
            
            return 'HEALTHY';
        }).catch(() => 'EVAL_ERROR');

        if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
            console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
            throw new Error("Watchdog detected video dead."); 
        } else if (status === 'PAUSED_AND_RECOVERED') {
            console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
            await page.bringToFront();
        }

        await new Promise(r => setTimeout(r, 5000)); 
    }
}

async function cleanup() {
    if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
    if (browser) { try { await browser.close(); } catch(e){} browser = null; }
}

process.on('SIGINT', async () => {
    console.log('\n[*] Stopping live script cleanly...');
    await cleanup();
    process.exit(0);
});

// =========================================================================
// ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// =========================================================================
setTimeout(async () => {
    console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GH_PAT;
    const ref = process.env.GITHUB_REF_NAME || 'main';
    
    if (!repo || !token) return;

    try {
        await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
            method: 'POST',
            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
            body: JSON.stringify({
                ref: ref,
                inputs: {
                    target_url: process.env.TARGET_URL,
                    okru_stream_channel: process.env.OKRU_STREAM_ID,
                    stream_quality: process.env.STREAM_QUALITY
                }
            })
        });
        console.log("[+] Next workflow run successfully triggered!");
    } catch (err) {
        console.error("[-] Failed to trigger next workflow.");
    }
}, 21000000); 

mainLoop();








// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             // 🛑 CORE ANTI-CRASH FLAGS 🛑
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--disable-dev-shm-usage', // Memory issue fix
//             '--disable-gpu',           // GPU disable taake graphic driver crash na ho

//             // 🛑 AGGRESSIVE MEMORY & STABILITY FLAGS (Black Screen Fix) 🛑
//             '--disable-software-rasterizer',
//             '--disable-accelerated-2d-canvas',
//             '--disable-background-timer-throttling', // Background me page stop nahi hoga
//             '--disable-backgrounding-occluded-windows', 
//             '--disable-renderer-backgrounding', 
//             '--force-color-profile=srgb',
//             '--js-flags="--max-old-space-size=1024"', // JS memory limit barha di

//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START 30-SEC DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 10) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (One Time Auto-Click)
//     console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
//     let unmuteClicked = false;
//     let unmuteAttempts = 0;

//     while (!unmuteClicked && unmuteAttempts < 15) {
//         for (const frame of page.frames()) {
//             try {
//                 const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
//                 if (unmuteBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         const parentStyle = window.getComputedStyle(el.parentElement);
//                         return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
//                     }, unmuteBtn);

//                     if (isVisible) {
//                         console.log(`[*] Unmute button found! Waiting like a human before clicking...`);
//                         await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
//                         await frame.evaluate(el => el.click(), unmuteBtn); 
//                         console.log(`[+] Successfully clicked UNMUTE! Proceeding...`);
                        
//                         unmuteClicked = true;
                        
//                         await new Promise(r => setTimeout(r, 2000));
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         if (unmuteClicked) break; 
//         unmuteAttempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🧠 3. THE SMART SCANNER 
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame...`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});

//     // 📡 5. START FFMPEG BROADCAST (NO MANUAL DELAYS - NATURAL SYNC)
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
//     let vfScale = 'scale=854:480';
//     let bv = '800k'; let maxrate = '850k'; let bufsize = '1700k'; let ba = '64k';

//     if (streamQuality.includes('50KBps')) {
//         vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
//     } else if (streamQuality.includes('30KBps')) {
//         vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
//     }

//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', 
        
//         // 👉 1. VIDEO INPUT (No manual offset)
//         '-use_wallclock_as_timestamps', '1', 
//         '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, 
        
//         // 👉 2. AUDIO INPUT (No manual offset)
//         '-use_wallclock_as_timestamps', '1', 
//         '-thread_queue_size', '1024', 
//         '-f', 'pulse', '-i', 'default',
        
//         '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
//         // Advanced Audio Resample for sync
//         '-af', 'aresample=async=1000', 
        
//         '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });

//     // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
//     console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 30000));
//     await recorder.stop();
//     console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

//     // 🧠 7. THE SMART WATCHDOG (With Anti-Pause capability)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
            
//             if (v.paused) {
//                 console.log("Video was paused! Forcing it back to play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_AND_RECOVERED';
//             }
            
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         } else if (status === 'PAUSED_AND_RECOVERED') {
//             console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
//             await page.bringToFront();
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();




// audio not sync issue




// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--disable-dev-shm-usage', 
//             '--disable-gpu',           
//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START 30-SEC DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 10) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (One Time Auto-Click)
//     console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
//     let unmuteClicked = false;
//     let unmuteAttempts = 0;

//     while (!unmuteClicked && unmuteAttempts < 15) {
//         for (const frame of page.frames()) {
//             try {
//                 const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
//                 if (unmuteBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         const parentStyle = window.getComputedStyle(el.parentElement);
//                         return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
//                     }, unmuteBtn);

//                     if (isVisible) {
//                         console.log(`[*] Unmute button found! Waiting like a human before clicking...`);
//                         await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
//                         await frame.evaluate(el => el.click(), unmuteBtn); 
//                         console.log(`[+] Successfully clicked UNMUTE! Proceeding...`);
                        
//                         unmuteClicked = true;
                        
//                         await new Promise(r => setTimeout(r, 2000));
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         if (unmuteClicked) break; 
//         unmuteAttempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🧠 3. THE SMART SCANNER 
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame...`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});

//     // 📡 5. START FFMPEG BROADCAST (PERFECT AUDIO SYNC WAPAS LAI GAYI HAI)
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
//     let vfScale = 'scale=854:480';
//     let bv = '800k'; let maxrate = '850k'; let bufsize = '1700k'; let ba = '64k';

//     if (streamQuality.includes('50KBps')) {
//         vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
//     } else if (streamQuality.includes('30KBps')) {
//         vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
//     }

//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', 
        
//         // 👉 1. VIDEO INPUT (WAPAS 0.8 SECONDS DELAY LAGA DIYA)
//         '-use_wallclock_as_timestamps', '1', 
//         '-itsoffset', '0.8', 
//         '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, 
        
//         // 👉 2. AUDIO INPUT (AUDIO SE DELAY NIKAL DIYA)
//         '-use_wallclock_as_timestamps', '1', 
//         '-thread_queue_size', '1024', 
//         '-f', 'pulse', '-i', 'default',
        
//         '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
//         // Advanced Audio Resample
//         '-af', 'aresample=async=1000', 
        
//         '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });

//     // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
//     console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 30000));
//     await recorder.stop();
//     console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

//     // 🧠 7. THE SMART WATCHDOG (With Anti-Pause capability)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
            
//             if (v.paused) {
//                 console.log("Video was paused! Forcing it back to play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_AND_RECOVERED';
//             }
            
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         } else if (status === 'PAUSED_AND_RECOVERED') {
//             console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
//             await page.bringToFront();
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();
















// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--disable-dev-shm-usage', 
//             '--disable-gpu',           
//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START 30-SEC DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 10) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (One Time Auto-Click)
//     console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
//     let unmuteClicked = false;
//     let unmuteAttempts = 0;

//     while (!unmuteClicked && unmuteAttempts < 15) {
//         for (const frame of page.frames()) {
//             try {
//                 const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
//                 if (unmuteBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         const parentStyle = window.getComputedStyle(el.parentElement);
//                         return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
//                     }, unmuteBtn);

//                     if (isVisible) {
//                         console.log(`[*] Unmute button found! Waiting like a human before clicking...`);
//                         await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
//                         await frame.evaluate(el => el.click(), unmuteBtn); 
//                         console.log(`[+] Successfully clicked UNMUTE! Proceeding...`);
                        
//                         unmuteClicked = true;
                        
//                         await new Promise(r => setTimeout(r, 2000));
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         if (unmuteClicked) break; 
//         unmuteAttempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🧠 3. THE SMART SCANNER 
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame...`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});

//     // 📡 5. START FFMPEG BROADCAST (PERFECT AUDIO SYNC WAPAS LAI GAYI HAI)
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
//     let vfScale = 'scale=854:480';
//     let bv = '800k'; let maxrate = '850k'; let bufsize = '1700k'; let ba = '64k';

//     if (streamQuality.includes('50KBps')) {
//         vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
//     } else if (streamQuality.includes('30KBps')) {
//         vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
//     }

//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', 
        
//         // 👉 1. VIDEO INPUT (WAPAS 0.8 SECONDS DELAY LAGA DIYA)
//         '-use_wallclock_as_timestamps', '1', 
//         '-itsoffset', '0.8', 
//         '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, 
        
//         // 👉 2. AUDIO INPUT (AUDIO SE DELAY NIKAL DIYA)
//         '-use_wallclock_as_timestamps', '1', 
//         '-thread_queue_size', '1024', 
//         '-f', 'pulse', '-i', 'default',
        
//         '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
//         // Advanced Audio Resample
//         '-af', 'aresample=async=1000', 
        
//         '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });

//     // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
//     console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 30000));
//     await recorder.stop();
//     console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

//     // 🧠 7. THE SMART WATCHDOG (With Anti-Pause capability)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
            
//             if (v.paused) {
//                 console.log("Video was paused! Forcing it back to play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_AND_RECOVERED';
//             }
            
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         } else if (status === 'PAUSED_AND_RECOVERED') {
//             console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
//             await page.bringToFront();
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();














// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
            
//             // 👉 YEH HAIN CRASH AUR BLACK SCREEN KE FIXES
//             '--disable-dev-shm-usage', 
//             '--disable-gpu',           
            
//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START 30-SEC DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 10) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (One Time Auto-Click)
//     console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
//     let unmuteClicked = false;
//     let unmuteAttempts = 0;

//     while (!unmuteClicked && unmuteAttempts < 15) {
//         for (const frame of page.frames()) {
//             try {
//                 const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
//                 if (unmuteBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         const parentStyle = window.getComputedStyle(el.parentElement);
//                         return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
//                     }, unmuteBtn);

//                     if (isVisible) {
//                         console.log(`[*] Unmute button found! Waiting like a human before clicking...`);
//                         await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
//                         await frame.evaluate(el => el.click(), unmuteBtn); 
//                         console.log(`[+] Successfully clicked UNMUTE! Proceeding...`);
                        
//                         unmuteClicked = true;
                        
//                         await new Promise(r => setTimeout(r, 2000));
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         if (unmuteClicked) break; 
//         unmuteAttempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🧠 3. THE SMART SCANNER 
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame...`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});

//     // 📡 5. START FFMPEG BROADCAST (PERFECT AUDIO SYNC)
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
//     let vfScale = 'scale=854:480';
//     let bv = '800k'; let maxrate = '850k'; let bufsize = '1700k'; let ba = '64k';

//     if (streamQuality.includes('50KBps')) {
//         vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
//     } else if (streamQuality.includes('30KBps')) {
//         vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
//     }

//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', 
        
//         // 👉 1. VIDEO INPUT (Video par koi delay nahi)
//         '-use_wallclock_as_timestamps', '1', 
//         '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, 
        
//         // 👉 2. AUDIO INPUT (Audio ko 0.5 seconds delay kiya hai)
//         '-use_wallclock_as_timestamps', '1', 
//         '-itsoffset', '0.5',  
//         '-thread_queue_size', '1024', 
//         '-f', 'pulse', '-i', 'default',
        
//         '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
//         // Advanced Audio Resample
//         '-af', 'aresample=async=1000', 
        
//         '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });

//     // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
//     console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 30000));
//     await recorder.stop();
//     console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

//     // 🧠 7. THE SMART WATCHDOG (With Anti-Pause capability)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
            
//             if (v.paused) {
//                 console.log("Video was paused! Forcing it back to play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_AND_RECOVERED';
//             }
            
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         } else if (status === 'PAUSED_AND_RECOVERED') {
//             console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
//             await page.bringToFront();
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();















// 1, iss mei eek issue tha agr website mei stream off huty pher ok.ru mei audio ataa tha and video bey lekin video black screen mei tha upper wlaey nee isko solve kar lya hai Alhamdullah



// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START 30-SEC DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 10) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (One Time Auto-Click)
//     console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
//     let unmuteClicked = false;
//     let unmuteAttempts = 0;

//     while (!unmuteClicked && unmuteAttempts < 15) {
//         for (const frame of page.frames()) {
//             try {
//                 const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
//                 if (unmuteBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         const parentStyle = window.getComputedStyle(el.parentElement);
//                         return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
//                     }, unmuteBtn);

//                     if (isVisible) {
//                         console.log(`[*] Unmute button found! Waiting like a human before clicking...`);
//                         await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
//                         await frame.evaluate(el => el.click(), unmuteBtn); 
//                         console.log(`[+] Successfully clicked UNMUTE! Proceeding...`);
                        
//                         unmuteClicked = true;
                        
//                         await new Promise(r => setTimeout(r, 2000));
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         if (unmuteClicked) break; 
//         unmuteAttempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🧠 3. THE SMART SCANNER 
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame...`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});








//     // 📡 5. START FFMPEG BROADCAST (PERFECT AUDIO SYNC)
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
//     let vfScale = 'scale=854:480';
//     let bv = '800k'; let maxrate = '850k'; let bufsize = '1700k'; let ba = '64k';

//     if (streamQuality.includes('50KBps')) {
//         vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
//     } else if (streamQuality.includes('30KBps')) {
//         vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
//     }

//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', 
        
//         // 👉 1. VIDEO INPUT (Video par koi delay nahi)
//         '-use_wallclock_as_timestamps', '1', 
//         '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, 
        
//         // 👉 2. AUDIO INPUT (Audio ko thora sa delay kiya hai: 0.5 seconds)
//         '-use_wallclock_as_timestamps', '1', 
//         '-itsoffset', '0.5',  // <--- Yahan 0.5 kiya hai
//         '-thread_queue_size', '1024', 
//         '-f', 'pulse', '-i', 'default',
        
//         '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
//         // Advanced Audio Resample
//         '-af', 'aresample=async=1000', 
        
//         '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });







    
//     // // 📡 5. START FFMPEG BROADCAST (FIXED AUDIO/VIDEO SYNC)
//     // console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
    
//     // let vfScale = 'scale=854:480';
//     // let bv = '800k'; let maxrate = '850k'; let bufsize = '1700k'; let ba = '64k';

//     // if (streamQuality.includes('50KBps')) {
//     //     vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
//     // } else if (streamQuality.includes('30KBps')) {
//     //     vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
//     // }

//     // const displayNum = process.env.DISPLAY || ':99';
//     // let ffmpegArgs = [
//     //     '-y', 
        
//     //     // 👉 1. VIDEO INPUT (Yahan video ko 0.8 sec delay kiya hai taake audio sath mil jaye)
//     //     '-use_wallclock_as_timestamps', '1', 
//     //     '-itsoffset', '0.8', 
//     //     '-thread_queue_size', '1024',
//     //     '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//     //     '-i', displayNum, 
        
//     //     // 👉 2. AUDIO INPUT (Audio se delay nikal diya gaya hai)
//     //     '-use_wallclock_as_timestamps', '1', 
//     //     '-thread_queue_size', '1024', 
//     //     '-f', 'pulse', '-i', 'default',
        
//     //     '-vf', vfScale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//     //     '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
//     //     '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        
//     //     // Advanced Audio Resample
//     //     '-af', 'aresample=async=1000', 
        
//     //     '-f', 'flv', RTMP_DESTINATION 
//     // ];
    
//     // ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     // ffmpegProcess.stderr.on('data', (data) => {
//     //     if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     // });

//     // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
//     console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 30000));
//     await recorder.stop();
//     console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

//     // 🧠 7. THE SMART WATCHDOG (With Anti-Pause capability)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
            
//             if (v.paused) {
//                 console.log("Video was paused! Forcing it back to play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_AND_RECOVERED';
//             }
            
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         } else if (status === 'PAUSED_AND_RECOVERED') {
//             console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
//             await page.bringToFront();
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();



















// =========== done done, audio and video sync nahey hu raha hai . opper waley mei fix karrt hai  =========================



// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const { spawn } = require('child_process');
// const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// // 🚀 Multi-Stream Key Manager
// const STREAM_KEYS = {
//     '1': '14601603391083_14040893622891_puxzrwjniu', 
//     '2': '14601696583275_14041072274027_apdzpdb5xi', 
//     '3': '14617940008555_14072500914795_ohw67ls7ny',
//     '4': '14601972227691_14041593547371_obdhgewlmq',
//     '5': '15145825803883_15082736847467_hjyjq4bud4',
//     '6': '15145851166315_15082784229995_mr5eweath4', 
//     '7': '15145866042987_15082813393515_axt6r27f7m',
//     '8': '15145878756971_15082836265579_oeowgtmnxu'
// };

// const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
// const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
// const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
// const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// let browser = null;
// let ffmpegProcess = null;

// // =========================================================================
// // 🔄 MAIN LOOP
// // =========================================================================
// async function mainLoop() {
//     while (true) {
//         try {
//             await startDirectStreaming();
//         } catch (error) {
//             console.error(`\n[!] ALERT: ${error.message}`);
//             console.log('[*] 🔄 Restarting everything in 3 seconds...');
//             await cleanup();
//             await new Promise(resolve => setTimeout(resolve, 3000));
//         }
//     }
// }

// async function startDirectStreaming() {
//     console.log(`[*] Starting browser and FFmpeg...`);
//     const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
//     browser = await puppeteer.launch({
//         headless: false, 
//         defaultViewport: { width: 1280, height: 720 },
//         ignoreDefaultArgs: ['--enable-automation'], 
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--window-size=1280,720',
//             '--kiosk', 
//             '--autoplay-policy=no-user-gesture-required'
//         ]
//     });

//     const page = await browser.newPage();
//     const pages = await browser.pages();
//     for (const p of pages) {
//         if (p !== page) await p.close();
//     }

//     // 🛑 POPUP & REDIRECT BLOCKER
//     browser.on('targetcreated', async (target) => {
//         if (target.type() === 'page') {
//             try {
//                 const newPage = await target.page();
//                 if (newPage && newPage !== page) {
//                     console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
//                     await page.bringToFront(); 
//                     await newPage.close();
//                 }
//             } catch (e) {}
//         }
//     });

//     console.log(`[*] Navigating to: ${TARGET_URL}`);
//     await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 🎥 1. START 30-SEC DEBUG RECORDING
//     const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
//     console.log('[*] 🔴 Debug Recording Started...');
//     await recorder.start('./recording.mp4');

//     await new Promise(r => setTimeout(r, 5000));

//     // 🖱️ 2. THE TERMINATOR CLICKER (JW Player)
//     console.log('[*] Hunting for the JW Player Play Button...');
//     let buttonGone = false;
//     let attempts = 0;
    
//     while (!buttonGone && attempts < 10) {
//         buttonGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
//                 if (playBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
//                     }, playBtn);

//                     if (isVisible) {
//                         buttonGone = false;
//                         console.log(`[*] Play button detected! Smashing it...`);
//                         await frame.evaluate(el => el.click(), playBtn); 
//                         await new Promise(r => setTimeout(r, 2000));
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         attempts++;
//         await new Promise(r => setTimeout(r, 1000));
//     }

//     // 🖱️ 2.5 THE NEW UNMUTE BUTTON CLICKER (Human-like)
//     console.log('[*] Hunting for the "CLICK UNMUTE STREAM" button...');
//     let unmuteGone = false;
//     let unmuteAttempts = 0;

//     while (!unmuteGone && unmuteAttempts < 15) {
//         unmuteGone = true;
//         for (const frame of page.frames()) {
//             try {
//                 // Looking for the specific button from your HTML screenshot
//                 const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
//                 if (unmuteBtn) {
//                     const isVisible = await frame.evaluate(el => {
//                         const style = window.getComputedStyle(el);
//                         const parentStyle = window.getComputedStyle(el.parentElement);
//                         return style.display !== 'none' && parentStyle.display !== 'none' && style.opacity !== '0';
//                     }, unmuteBtn);

//                     if (isVisible) {
//                         unmuteGone = false;
//                         console.log(`[*] Unmute button found! Waiting like a human before clicking... (Attempt ${unmuteAttempts + 1}/15)`);
                        
//                         // Human-like random delay between 1.5 to 2.5 seconds before clicking
//                         await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
//                         await frame.evaluate(el => el.click(), unmuteBtn); 
                        
//                         // Wait to see if it triggers an ad and allow popup blocker to work
//                         await new Promise(r => setTimeout(r, 2000));
                        
//                         // Enforce focus back to the main stream page
//                         await page.bringToFront();
//                         break; 
//                     }
//                 }
//             } catch (err) {}
//         }
//         unmuteAttempts++;
//         await new Promise(r => setTimeout(r, 1000)); // Check again after 1 sec
//     }

//     // 🧠 3. THE SMART SCANNER 
//     console.log('[*] Scanning iframes for the REAL Live Stream Video...');
//     let targetFrame = null;
//     for (const frame of page.frames()) {
//         try {
//             const isRealLiveStream = await frame.evaluate(() => {
//                 const vid = document.querySelector('video');
//                 if (!vid) return false;
//                 if (vid.clientWidth < 100 || vid.clientHeight < 100) return false; 
//                 return true; 
//             });

//             if (isRealLiveStream) {
//                 targetFrame = frame;
//                 console.log(`[+] Smart Scanner locked onto video frame: ${frame.url().substring(0, 50)}...`);
//                 break; 
//             }
//         } catch (e) { }
//     }

//     if (!targetFrame) {
//         console.log('[-] Smart Scanner could not find an iframe with video, defaulting to main page.');
//         targetFrame = page.mainFrame();
//     }

//     // ⬛ 4. IMMEDIATE BLACK BACKGROUND & FULLSCREEN FORCE (UNTOUCHED)
//     console.log('[*] Enforcing Black Background and Full Screen UI...');
//     await page.evaluate(() => {
//         document.body.style.backgroundColor = 'black';
//         document.body.style.overflow = 'hidden';
//         document.querySelectorAll('iframe').forEach(iframe => {
//             iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
//             iframe.style.width = '100vw'; iframe.style.height = '100vh';
//             iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
//         });
//     }).catch(() => {});

//     await targetFrame.evaluate(async () => {
//         const style = document.createElement('style');
//         style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
//         document.head.appendChild(style);

//         const video = document.querySelector('video');
//         if (video) { 
//             video.muted = false; 
//             video.volume = 1.0; 
//             video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
//             video.style.width = '100vw'; video.style.height = '100vh';
//             video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
//         }
//     }).catch(()=>{});

//     // 📡 5. START FFMPEG BROADCAST
//     console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL} - Quality: ${streamQuality}`);
//     const displayNum = process.env.DISPLAY || ':99';
//     let ffmpegArgs = [
//         '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
//         '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
//         '-i', displayNum, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'default',
//         '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
//         '-b:v', '800k', '-maxrate', '850k', '-bufsize', '1700k',
//         '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-ar', '44100',
//         '-async', '1', '-f', 'flv', RTMP_DESTINATION 
//     ];
    
//     ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
//     ffmpegProcess.stderr.on('data', (data) => {
//         if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
//     });

//     // ⏱️ 6. STOP RECORDING AFTER 30 SECONDS
//     console.log('[*] Capturing stream for 30 seconds to finalize Debug Recording...');
//     await new Promise(r => setTimeout(r, 30000));
//     await recorder.stop();
//     console.log('[+] 30-Sec Debug Video Saved! Safe to cancel workflow anytime now.');

//     // 🧠 7. THE SMART WATCHDOG (Now with Anti-Pause capability)
//     console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
//     while (true) {
//         if (!browser || !browser.isConnected()) throw new Error("Browser closed.");

//         const status = await targetFrame.evaluate(() => {
//             const bodyText = document.body.innerText.toLowerCase();
//             if (bodyText.includes("stream error") || bodyText.includes("could not be loaded")) return 'CRITICAL_ERROR';
            
//             const v = document.querySelector('video');
//             if (!v || v.ended) return 'DEAD';
            
//             // NEW: Anti-Pause Check. If video is paused, force it to play.
//             if (v.paused) {
//                 console.log("Video was paused! Forcing it back to play...");
//                 v.play().catch(()=>{});
//                 return 'PAUSED_AND_RECOVERED';
//             }
            
//             return 'HEALTHY';
//         }).catch(() => 'EVAL_ERROR');

//         if (status === 'CRITICAL_ERROR' || status === 'DEAD') {
//             console.log('\n[!] ❌ STREAM DEAD DETECTED! Restarting process...');
//             throw new Error("Watchdog detected video dead."); 
//         } else if (status === 'PAUSED_AND_RECOVERED') {
//             console.log('[!] ⚠️ Stream was paused by an ad/popup. Successfully resumed it!');
//             // Re-enforce focus just in case an invisible ad stole it
//             await page.bringToFront();
//         }

//         await new Promise(r => setTimeout(r, 5000)); 
//     }
// }

// async function cleanup() {
//     if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
//     if (browser) { try { await browser.close(); } catch(e){} browser = null; }
// }

// process.on('SIGINT', async () => {
//     console.log('\n[*] Stopping live script cleanly...');
//     await cleanup();
//     process.exit(0);
// });

// // =========================================================================
// // ⏱️ AUTO-OVERLAP TRIGGER (Runs exactly after 5h 50m)
// // =========================================================================
// setTimeout(async () => {
//     console.log("\n[*] 5h 50m completed! Triggering next action for overlap...");
//     const repo = process.env.GITHUB_REPOSITORY;
//     const token = process.env.GH_PAT;
//     const ref = process.env.GITHUB_REF_NAME || 'main';
    
//     if (!repo || !token) return;

//     try {
//         await fetch(`https://api.github.com/repos/${repo}/actions/workflows/main.yml/dispatches`, {
//             method: 'POST',
//             headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
//             body: JSON.stringify({
//                 ref: ref,
//                 inputs: {
//                     target_url: process.env.TARGET_URL,
//                     okru_stream_channel: process.env.OKRU_STREAM_ID,
//                     stream_quality: process.env.STREAM_QUALITY
//                 }
//             })
//         });
//         console.log("[+] Next workflow run successfully triggered!");
//     } catch (err) {
//         console.error("[-] Failed to trigger next workflow.");
//     }
// }, 21000000); 

// mainLoop();
