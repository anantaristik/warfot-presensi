export function getPayrollPeriod(cutoffDay: number) {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();

  let start: Date;
  let end: Date;

  if (today <= cutoffDay) {
    // 21 bulan lalu → 20 bulan ini
    start = new Date(year, month - 1, cutoffDay + 1, 0, 0, 0);
    end = new Date(year, month, cutoffDay, 23, 59, 59);
  } else {
    // 21 bulan ini → 20 bulan depan
    start = new Date(year, month, cutoffDay + 1, 0, 0, 0);
    end = new Date(year, month + 1, cutoffDay, 23, 59, 59);
  }

  return { start, end };
}
