export const purposes = [
  { id: "story", label: "Kể chuyện" },
  { id: "explain", label: "Giải thích kiến thức" },
];
export const audiences = [
  { id: "primary", label: "Tiểu học" },
  { id: "secondary", label: "THCS / THPT" },
  { id: "adult", label: "Người lớn" },
];
export function contentSettings(p) {
  return {
    contentMode: p.contentMode || "story",
    audience: p.audience || "primary",
  };
}
export function validateContentSettings(p) {
  const v = contentSettings(p);
  if (
    !purposes.some((x) => x.id === v.contentMode) ||
    !audiences.some((x) => x.id === v.audience)
  )
    throw Error("Mục tiêu hoặc đối tượng video không hợp lệ.");
  return v;
}
export function purposeInstruction(p) {
  const { contentMode, audience } = contentSettings(p);
  const level = audiences.find((x) => x.id === audience)?.label || audience;
  return contentMode === "explain"
    ? `VIDEO PURPOSE: KNOWLEDGE EXPLANATION. Audience: ${level}. Each scene must teach its narrated idea, not decorate it. Choose an appropriate explanatory visual: concept example, process/flow, before-after comparison, cause-effect, labelled structure, or concrete counting model. Use spatial arrangement, grouping, consistent colour coding and purposeful arrows. Never add a presenter/person unless needed by the subject. Preserve all quantities, sequence, mechanisms and relationships in the source; do not invent facts, measurements, anatomy or equations. Treat simplifications as schematic, not exact scale. Use only short necessary labels quoted verbatim from the narration; no decorative text. Do not invent equations or numeric chart data. Repeated objects in separate process stages or comparison columns are valid when intentional; do not clone named people. Clear learning order and readable ${p.aspectRatio||"16:9"} composition.`
    : `VIDEO PURPOSE: STORYTELLING. Audience: ${level}. Illustrate the narrative action/emotion, keep character identities and setting consistent. One coherent moment per scene. Do not turn it into an unrelated lecture or introduce characters absent from the story. No text inside the illustration; narration/subtitles provide the words.`;
}
export function visualPlan(value, mode, text) {
  if (mode !== "explain") return null;
  const kinds = [
    "concept",
    "process",
    "comparison",
    "cause-effect",
    "structure",
    "counting",
  ];
  if (
    !value ||
    !kinds.includes(value.type) ||
    typeof value.goal !== "string" ||
    !value.goal.trim()
  )
    throw Error(
      "AI chưa xác định mục tiêu và cách minh họa kiến thức cho cảnh.",
    );
  const labels = value.labels ?? [];
  if (
    !Array.isArray(labels) ||
    labels.length > 6 ||
    labels.some((x) => typeof x !== "string" || !x.trim() || x.length > 60)
  )
    throw Error("Nhãn kiến thức cần ngắn và hợp lệ.");
  if (
    text &&
    labels.some(
      (label) =>
        !text.toLocaleLowerCase().includes(label.trim().toLocaleLowerCase()),
    )
  )
    throw Error(
      "Nhãn ảnh không có trong lời kể nguồn. Không tự thêm thuật ngữ.",
    );
  return {
    type: value.type,
    goal: value.goal.slice(0, 1000),
    labels: labels.map((x) => x.trim()),
  };
}
export function imageBaseStyle(p) {
  return p.contentMode === "explain"
    ? "Educational whiteboard illustration, crisp consistent dark outlines, warm cream paper background #F6F1E3, restrained contrasting accents, uncluttered readable 16:9 composition, precise meaningful arrows when required, visually distinguish parts and stages, no watermark. Prioritize explanatory clarity over decorative characters."
    : "Minimal educational hand-drawn whiteboard illustration. Warm flat paper background #F6F1E3, dark clean sketch lines, small accents of red orange blue. 16:9 composition. Large separate objects with generous space and minimal overlaps. No lettering, no labels, no numbers, no watermark. Consistent simple cartoon people.";
}
