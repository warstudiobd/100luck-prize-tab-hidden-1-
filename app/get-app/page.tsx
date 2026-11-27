import { permanentRedirect } from "next/navigation";

/** The old Get App page is retired; send its URL straight to the APK download. */
export default function GetAppPage() {
  permanentRedirect("/download/100LUCK-1.0.0.apk");
}
