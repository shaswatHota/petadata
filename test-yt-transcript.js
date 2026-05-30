import { YoutubeTranscript } from 'youtube-transcript';

async function main() {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript('dQw4w9WgXcQ');
    console.log("youtube-transcript Success! Fetched", transcript.length, "segments");
  } catch (err) {
    console.error("youtube-transcript error:", err);
  }
}

main().catch(console.error);
