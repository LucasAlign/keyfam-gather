import QRCode from "qrcode";

// Renders the opaque check-in token as a scannable SVG. The payload is the
// bearer token itself, never a URL or database ID, so the printed badge
// reveals nothing about record structure if intercepted.
export async function renderCheckInQrSvg(token: string) {
  return QRCode.toString(token, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 240 });
}
