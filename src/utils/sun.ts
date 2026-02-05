// Simplified NOAA solar calculator for London (51.507°N, -0.079°W)
// Returns today's sunrise and sunset as Date objects in local time.

const LAT = 51.507;
const LNG = -0.079;
const ZENITH = 90.833; // official sunrise/sunset zenith
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function sunHourUTC(dayOfYear: number, rising: boolean): number {
  const lngHour = LNG / 15;
  const approxT = dayOfYear + ((rising ? 6 : 18) - lngHour) / 24;

  const M = 0.9856 * approxT - 3.289;
  let L = M + 1.916 * Math.sin(M * D2R) + 0.020 * Math.sin(2 * M * D2R) + 282.634;
  L = ((L % 360) + 360) % 360;

  let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R));
  RA = ((RA % 360) + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;

  const sinDec = 0.39782 * Math.sin(L * D2R);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(ZENITH * D2R) - sinDec * Math.sin(LAT * D2R)) /
    (cosDec * Math.cos(LAT * D2R));

  if (cosH > 1 || cosH < -1) return rising ? 6 : 18; // polar edge case fallback

  const H = rising
    ? 360 - R2D * Math.acos(cosH)
    : R2D * Math.acos(cosH);

  const UT = H / 15 + RA - 0.06571 * approxT - 6.622;
  return ((UT - lngHour) % 24 + 24) % 24;
}

export function getSunTimes(date: Date): { sunrise: Date; sunset: Date } {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor(
    (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  const riseH = sunHourUTC(dayOfYear, true);
  const setH = sunHourUTC(dayOfYear, false);

  const sunrise = new Date(date);
  sunrise.setHours(Math.floor(riseH), Math.round((riseH % 1) * 60), 0, 0);

  const sunset = new Date(date);
  sunset.setHours(Math.floor(setH), Math.round((setH % 1) * 60), 0, 0);

  return { sunrise, sunset };
}

export function isDaytime(date: Date = new Date()): boolean {
  const { sunrise, sunset } = getSunTimes(date);
  return date >= sunrise && date < sunset;
}
