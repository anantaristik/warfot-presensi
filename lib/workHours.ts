export function calculateWorkHours(clockIn: Date, clockOut: Date) {
  // Aturan jam kerja tetap
  const START_HOUR = 11;
  const START_TOLERANCE_MINUTE = 15; // toleransi sampai 11:15
  const END_HOUR = 21;

  const inHour = clockIn.getHours();
  const inMinute = clockIn.getMinutes();
  const outHour = clockOut.getHours();
  const outMinute = clockOut.getMinutes();

  // === NORMALISASI JAM MASUK ===
  let effectiveStartHour: number;

  // Kalau masuk sebelum atau sama dengan 11:15 → dihitung dari 11:00
  if (
    inHour < START_HOUR ||
    (inHour === START_HOUR && inMinute <= START_TOLERANCE_MINUTE)
  ) {
    effectiveStartHour = START_HOUR; // 11:00
  } else {
    // Masuk setelah 11:15 → jam pertama hangus → mulai jam 12
    effectiveStartHour = START_HOUR + 1; // 12:00
  }

  // === NORMALISASI JAM PULANG ===
  let effectiveEndHour: number;

  if (
    outHour > END_HOUR ||
    (outHour === END_HOUR && outMinute > 0)
  ) {
    effectiveEndHour = END_HOUR; // Maksimal dihitung sampai jam 21:00
  } else {
    effectiveEndHour = outHour;
  }

  // === HITUNG JAM KERJA ===
  let totalHours = effectiveEndHour - effectiveStartHour;

  if (totalHours < 0) totalHours = 0;
  if (totalHours > 10) totalHours = 10; // Max normal 10 jam

  return {
    defaultHours: totalHours, // jam hasil sistem
  };
}
