// Shared by the editor and exporter so displayed and rendered durations agree.
export function timingForSpeech(
  originalMs,
  audioMs,
  mode = "fit",
  minMs = 1000,
) {
  if (
    ![originalMs, audioMs, minMs].every(Number.isFinite) ||
    audioMs <= 0 ||
    originalMs <= 500
  )
    throw Error("Thời lượng không hợp lệ.");
  let rate = 1;
  if (mode === "fit")
    rate = Math.max(0.85, Math.min(1.1, audioMs / (originalMs - 500)));
  else if (mode === "fixed") {
    rate = audioMs / (originalMs - 500);
    if (rate < 0.7 || rate > 1.2)
      throw Error(
        "Lời đọc quá ngắn hoặc dài so với cảnh. Chọn Tự điều chỉnh hoặc chỉnh tốc độ giọng rồi tạo lại lời đọc.",
      );
  } else if (mode !== "voice") throw Error("Chế độ thời lượng không hợp lệ.");
  const audioDurationMs = mode === "fixed" ? originalMs - 500 : Math.ceil(audioMs / rate);
  return {
    playbackRate: rate,
    audioDurationMs,
    durationMs:
      mode === "fixed" ? originalMs : Math.max(minMs, audioDurationMs + 500),
  };
}
