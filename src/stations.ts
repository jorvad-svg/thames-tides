export interface Station {
  id: string;
  name: string;
  eaStation: string;
  admiraltyStation: string;
  cdToMaod: number;
}

export const STATIONS: Station[] = [
  { id: 'tower-pier',   name: 'Tower Pier',   eaStation: '0007', admiraltyStation: '0113',  cdToMaod: -2.97 },
  { id: 'silvertown',   name: 'Silvertown',   eaStation: '0001', admiraltyStation: '0112',  cdToMaod: -2.79 },
  { id: 'hammersmith',  name: 'Hammersmith',  eaStation: '0010', admiraltyStation: '0115',  cdToMaod: -1.06 },
  { id: 'richmond',     name: 'Richmond',     eaStation: '0009', admiraltyStation: '0116',  cdToMaod: +0.34 },
  { id: 'tilbury',      name: 'Tilbury',      eaStation: '0020', admiraltyStation: '0111',  cdToMaod: -2.60 },
  { id: 'southend',     name: 'Southend',     eaStation: '0019', admiraltyStation: '0110',  cdToMaod: -2.51 },
];

export const DEFAULT_STATION = STATIONS[0];
