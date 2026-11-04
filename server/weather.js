/* WW2 Royale 1.25 — deterministic in-game calendar and winter travel modifiers.
   This is the single clock used by land and naval orders. All movement speeds
   are snapshotted at dispatch (and re-evaluated on a redirect/retreat); an
   already-dispatched army does not jump when the season changes. */

const DAY_MS = 86400000;
const DEFAULT_START = '1939-10-06';
const DEFAULT_END = '1945-09-02';
const DEFAULT_SECONDS_PER_MATCH = 3600;

export function campaignDayAt(g,now=Date.now()){
  const start=Date.parse(`${g.map.startDate||DEFAULT_START}T00:00:00Z`);
  const end=Date.parse(`${g.map.endDate||DEFAULT_END}T00:00:00Z`);
  const duration=Number(g.map.secondsPerMatch||DEFAULT_SECONDS_PER_MATCH)*1000;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!(duration>0))return 0;
  const totalDays=Math.round((end-start)/DAY_MS);
  const fraction=Math.max(0,Math.min(1,(now-g.campaignStartAt)/duration));
  return Math.min(totalDays,Math.floor(fraction*totalDays));
}
export function campaignDateAt(g,now=Date.now()){
  const start=Date.parse(`${g.map.startDate||DEFAULT_START}T00:00:00Z`);
  if(!Number.isFinite(start))return new Date(Date.UTC(1939,9,6));
  return new Date(start+campaignDayAt(g,now)*DAY_MS);
}

/* Winter runs Dec 1 through the end of February.
   December: begins at severity ~0.5, rises toward peak.
   January: strongest around Jan 15.
   February: gradually thaws toward severity ~0.5.
   Other nine months: no movement penalty.
   The curve is deterministic and handles the 1940/1944 leap years. */
export function winterSeverityAt(g,now=Date.now()){
  const date=campaignDateAt(g,now),month=date.getUTCMonth();
  if(month!==11&&month!==0&&month!==1)return 0;
  const year=date.getUTCFullYear();
  const first=Date.UTC(month===11?year:year-1,11,1);
  const last=Date.UTC(month===11?year+1:year,2,1);
  const progress=Math.max(0,Math.min(1,(date.getTime()-first)/(last-first)));
  return 0.5 + 0.5*Math.sin(Math.PI*progress);
}
export const WINTER_LAND_ADDITIONAL_MS=Object.freeze({infantry:5000,tank:10000,bomber:0});
export const WINTER_NAVAL_PEAK_MULTIPLIER=4/3;

/** Server-authoritative troop travel time per province border. */
export function winterUnitHopMs(type,normalMs,severity){
  const addition=WINTER_LAND_ADDITIONAL_MS[type]||0;
  return Math.round(normalMs+addition*Math.max(0,Math.min(1,severity)));
}
/** Navy has a 16.7% slowdown in early/late winter and 33.3% at peak. */
export function winterNavalDurationMs(baseMs,severity){
  return Math.max(1,Math.round(baseMs*(1+Math.max(0,Math.min(1,severity))/3)));
}
