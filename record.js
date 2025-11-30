const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const { spawn } = require("child_process");
const fs = require("fs");

puppeteer.use(StealthPlugin());

const url = process.argv[2] || "https://example.com";
const outputFile = process.argv[3] || "/recordings/output.mkv";

const wait = async (msec) => {
    console.log(`Waiting ${msec / 1000} seconds`);
    return new Promise((res) => setTimeout(res, msec));
};

async function main() {
    console.log("Starting browser to", url);

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "/usr/bin/chromium",
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--autoplay-policy=no-user-gesture-required",
            // "--use-fake-ui-for-media-stream",
            // "--use-fake-device-for-media-stream",
            "--disable-features=TranslateUI",
            `--window-size=${1920},${1080}`,
        ],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    await wait(2000);
    // Toggle camera and mic via shortcuts
    await page.keyboard.down("Meta");
    await page.keyboard.press("KeyD");
    await page.keyboard.up("Meta");

    await page.keyboard.down("Meta");
    await page.keyboard.press("KeyE");
    await page.keyboard.up("Meta");
    await wait(2000);

    // Your Meet join automation
    await page.click("input.qdOxv-fmcmS-wGMbrd");
    await page.type(
        "input.qdOxv-fmcmS-wGMbrd",
        "luminote.ai bot : AI meeting notetaker"
    );

    await page.click("span.UywwFc-vQzf8d");

    await wait(3000);

    // --- VIDEO: puppeteer-screen-recorder ---
    const tmpVideo = "/tmp/video.mp4";
    const tmpAudio = "/tmp/audio.m4a";

    const recorderOptions = {
        followNewTab: false,
        fps: 50,
        size: { width: 1920, height: 1080 },
    };

    // --- AUDIO: ffmpeg audio-only from Pulse ---
    // ---- AUDIO (ffmpeg from PulseAudio) ----
    console.log("Starting AUDIO recorder:", tmpAudio);
    const ffmpegAudio = spawn(
        "ffmpeg",
        [
            "-y",
            "-f",
            "pulse",
            "-i",
            "record_sink.monitor",

            // record EXACT duration, avoids long stop lag
            "-t",
            "20.0",

            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            tmpAudio,
        ],
        { stdio: ["ignore", "inherit", "inherit"] }
    );

    ffmpegAudio.on("exit", (code) => console.log("ffmpeg audio exited:", code));
    const recorder = new PuppeteerScreenRecorder(page, recorderOptions);

    console.log("Starting screen recorder:", tmpVideo);
    await recorder.start(tmpVideo);

    ffmpegAudio.on("exit", (code) => {
        console.log("ffmpeg audio exited with code", code);
    });

    // Record for 20 seconds (or however long you want)
    await wait(20000);

    console.log("Stopping recorder & audio...");
    await recorder.stop(); // finish video
    await new Promise((res) => ffmpegAudio.on("close", res));

    // Give ffmpeg a moment to flush
    await wait(2000);

    // --- MERGE: video + audio -> final outputFile ---
    console.log("Merging video and audio into", outputFile);

    // ensure recordings dir exists
    try {
        fs.mkdirSync(require("path").dirname(outputFile), { recursive: true });
    } catch (_) {}

    const merge = spawn(
        "ffmpeg",
        [
            "-y",
            "-i",
            tmpVideo,
            "-i",
            tmpAudio,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            outputFile,
        ],
        { stdio: ["ignore", "inherit", "inherit"] }
    );

    await new Promise((resolve, reject) => {
        merge.on("exit", (code) => {
            console.log("ffmpeg merge exited with code", code);
            if (code === 0) resolve();
            else reject(new Error("ffmpeg merge failed with code " + code));
        });
    });

    // Optional cleanup
    try {
        fs.unlinkSync(tmpVideo);
    } catch (_) {}
    try {
        fs.unlinkSync(tmpAudio);
    } catch (_) {}

    await browser.close();
    console.log("Done, final file:", outputFile);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
