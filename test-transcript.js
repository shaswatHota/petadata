import { getTranscript, extractReviewerAnalysis } from './lib/transcript.js';
import { Innertube } from "youtubei.js";

async function main() {
  console.log("Testing getTranscript...");
  // Use a different YouTube video ID
  const videoId = "engW7tLmD4"; // A video id I know? Let's just try a known one or dQw4w9WgXcQ
  
  const yt = await Innertube.create({ generate_session_locally: true });
  const info = await yt.getInfo("dQw4w9WgXcQ");
  console.log("Title for dQw4w9WgXcQ:", info.basic_info.title);

  const transcript = await getTranscript("dQw4w9WgXcQ");
  
  if (transcript) {
    console.log("Success! Transcript fetched:");
    console.log(transcript.substring(0, 200) + "...");
  } else {
    console.log("Failed to fetch transcript.");
  }
}

main().catch(console.error);
