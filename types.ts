
export type Unit = 'mm' | 'cm' | 'in';

export interface Frame {
  id: string;
  src: string;
  name: string;
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
}

export interface JobSettings {
  unit: Unit;
  widthMm: number;
  heightMm: number;
  hppi: number;
  vppi: number;
  lpi: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  alignmentPos: 'external' | 'internal' | 'edge-centered';
  direction: 'LR' | 'RL';
}

export interface CalibrationSettings {
  centerLpi: number;
  stripCount: number;
  stepLpi: number;
}

export interface PhysicsSettings {
  radiusMicrons: number;
  thicknessMicrons: number;
  refractiveIndex: number;
  viewingDistanceMm: number;
}

export interface Preset {
  id: string;
  name: string;
  job: JobSettings;
  physics: PhysicsSettings;
}
