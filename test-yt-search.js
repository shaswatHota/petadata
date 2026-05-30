import { searchYouTube } from './lib/wire.js';

async function main() {
  try {
    const videos = await searchYouTube("iPhone 15");
    console.log(`Found ${videos.length} videos`);
    if (videos.length > 0) {
      console.log("First video:", JSON.stringify(videos[0], null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main().catch(console.error);
