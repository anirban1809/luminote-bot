const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

// Inputs
const url = process.argv[2] || "https://example.com";
const outputFile = process.argv[3] || "/recordings/output.mkv";

const width = parseInt(process.env.WIDTH || "1920", 10);
const height = parseInt(process.env.HEIGHT || "1080", 10);
const RECORD_SECONDS = parseInt(process.env.RECORD_SECONDS || "20", 10);

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
    console.log("Launching browser:", url);

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
            `--window-size=${width},${height}`,
        ],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    // Join Meet
    await wait(1500);
    await page.click("input.qdOxv-fmcmS-wGMbrd");
    await page.type(
        "input.qdOxv-fmcmS-wGMbrd",
        "luminote.ai bot : AI meeting notetaker"
    );
    await page.click("span.UywwFc-vQzf8d");

    await wait(5000); // give Meet time to stabilize

    // ---- PATHS ----
    const tmpVideo = "/tmp/video.mp4";
    const tmpAudio = "/tmp/audio.m4a";

    // ---- VIDEO (puppeteer-screen-recorder) ----
    const recorder = new PuppeteerScreenRecorder(page, {
        fps: 30,
        videoFrame: {
            width: 1920, // Desired width in pixels
            height: 1080, // Desired height in pixels
        },
        aspectRatio: "16:9",
    });

    console.log("Starting VIDEO recorder:", tmpVideo);
    await recorder.start(tmpVideo);

    console.log("Starting AUDIO recorder:", tmpAudio);
    const ffmpegAudio = spawn(
        "ffmpeg",
        [
            "-y",
            "-f",
            "pulse",
            "-i",
            "record_sink.monitor",
            "-t",
            String(RECORD_SECONDS),
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            tmpAudio,
        ],
        { stdio: ["ignore", "inherit", "inherit"] }
    );

    // Create the promise *now*, before ffmpeg can finish
    const audioDone = new Promise((resolve) => {
        ffmpegAudio.on("close", (code) => {
            console.log("ffmpeg audio exited:", code);
            resolve();
        });
    });

    // ...

    await wait(RECORD_SECONDS * 1000);

    console.log("Stopping video recorder…");
    await recorder.stop();

    // ---- WAIT for AUDIO to finish (clean stop) ----
    await audioDone;

    // ---- MERGE ----
    console.log("Merging video + audio →", outputFile);

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    const merge = spawn(
        "ffmpeg",
        [
            "-y",
            "-i",
            tmpVideo,
            "-i",
            tmpAudio,

            // Explicit stream mapping
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

    await new Promise((res) => merge.on("close", res));

    try {
        fs.unlinkSync(tmpVideo);
    } catch {}
    try {
        fs.unlinkSync(tmpAudio);
    } catch {}

    await browser.close();

    console.log("DONE →", outputFile);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
