import { Innertube } from "youtubei.js";

async function main() {
  try {
    const yt = await Innertube.create({ generate_session_locally: true });
    const info = await yt.getInfo("dQw4w9WgXcQ", "IOS");
    console.log("Title:", info.basic_info.title);

    try {
      const transcriptData = await info.getTranscript();
      console.log("Transcript fetched!");
      console.log(Object.keys(transcriptData));
      if (transcriptData.transcript) {
        console.log("Has transcript property");
      }
    } catch (err) {
      console.error("getTranscript error:", err);
    }
  } catch (err) {
    console.error("getInfo error:", err);
  }
}

main().catch(console.error);
