const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

// Inputs
const url = process.argv[2] || "https://meet.google.com/kdj-jdjx-fbv";
const outputFile = process.argv[3] || "./recordings/output.mkv";

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
            "--disable-features=TranslateUI",
            `--window-size=${1920},${1080}`,
        ],
    });

    const pages = await browser.pages();
    const page = pages[0]; // use first tab

    await page.goto(url, { waitUntil: "networkidle2" });

    await page.click("input.qdOxv-fmcmS-wGMbrd");
    await page.type("input.qdOxv-fmcmS-wGMbrd", "luminote.ai notetaker");
    await page.click("span.UywwFc-vQzf8d");

    await wait(5000); // give Meet time to stabilize

    // ---- PATHS ----
    const tmpVideo = "/tmp/video.mp4";
    const tmpAudio = "/tmp/audio.m4a";

    // ---- VIDEO (puppeteer-screen-recorder) ----
    const recorder = new PuppeteerScreenRecorder(page, {
        fps: 30, // 60 is overkill and heavier
        videoFrame: { width, height }, // match viewport
        aspectRatio: "16:9",
        videoCodec: "libx264",
        videoPreset: "veryfast", // “ultrafast” = lower quality
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
            "-ac",
            "2", // stereo
            "-ar",
            "48000", // 48 kHz
            "-i",
            "record_sink.monitor",
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "160k", // bump a bit if you care about music/voices
            "-af",
            "aresample=async=1:first_pts=0",
            tmpAudio,
        ],
        {
            stdio: ["pipe", "inherit", "inherit"],
        }
    );

    // Create the promise *now*, before ffmpeg can finish
    const audioDone = new Promise((resolve) => {
        ffmpegAudio.on("close", (code) => {
            console.log("ffmpeg audio exited:", code);
            resolve();
        });
    });

    await page.exposeFunction("onSpanVisible", async () => {
        console.log("Span appeared");
        await page.click("span.VfPpkd-vQzf8d");
    });

    await page.evaluate(() => {
        const targetClass = "VfPpkd-vQzf8d";

        const observer = new MutationObserver(() => {
            const span = document.querySelector(`span.${targetClass}`);
            if (span) {
                window.onSpanVisible();
            }
        });

        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: false,
        });
    });

    await page.waitForFunction(
        (text) => {
            const h1s = Array.from(document.querySelectorAll("h1"));
            return h1s.some((h) => h.textContent.trim().includes(text));
        },
        { timeout: 0 },
        "You've been removed from the meeting"
    );
    ffmpegAudio.stdin.write("q"); // <-- tells ffmpeg to quit immediately
    ffmpegAudio.stdin.end(); // close stdin
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
