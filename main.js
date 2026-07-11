/**
 * Neutron Star Merger Simulator
 * Main application, rendering, simulation state, UI, charts, and animation loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ========================================================================
// SECTION 1: PHYSICAL CONSTANTS
// Reference: CODATA 2018, IAU 2015
// ========================================================================
import { PHYS, EOS_MODELS } from './constants.js';

// ========================================================================
// SECTION 3: PHYSICS ENGINE — Orbital Mechanics
// References: Peters 1964, Maggiore 2007
// ========================================================================

/** Chirp mass in kg. Mc = (m1*m2)^(3/5) / (m1+m2)^(1/5) */
function computeChirpMass(m1s, m2s) {
  const m1 = m1s * PHYS.M_sun, m2 = m2s * PHYS.M_sun;
  return Math.pow(m1 * m2, 3/5) / Math.pow(m1 + m2, 1/5);
}

/** Orbital frequency in Hz from separation (m) */
function computeOrbitalFrequency(a, m1s, m2s) {
  const M = (m1s + m2s) * PHYS.M_sun;
  return (1 / (2 * Math.PI)) * Math.sqrt(PHYS.G * M / (a * a * a));
}

/** Peters' analytic solution: a(τ) from time-to-merger τ (seconds) */
function computeSeparationFromTau(tau, m1s, m2s) {
  const m1 = m1s * PHYS.M_sun, m2 = m2s * PHYS.M_sun;
  const coeff = (256/5) * Math.pow(PHYS.G, 3) * m1 * m2 * (m1 + m2) / Math.pow(PHYS.c, 5);
  return Math.pow(coeff * Math.max(tau, 1e-10), 0.25);
}

/** Time to merger from initial separation a0 (meters). Peters 1964 Eq. 5.6 */
function computeMergerTime(a0, m1s, m2s) {
  const m1 = m1s * PHYS.M_sun, m2 = m2s * PHYS.M_sun;
  return (5/256) * Math.pow(PHYS.c, 5) * Math.pow(a0, 4) / (Math.pow(PHYS.G, 3) * m1 * m2 * (m1 + m2));
}

/** Orbital velocity at separation a */
function computeOrbitalVelocity(a, m1s, m2s) {
  const M = (m1s + m2s) * PHYS.M_sun;
  return Math.sqrt(PHYS.G * M / a);
}

/** Contact separation = sum of radii */
function computeContactSeparation(r1_km, r2_km) {
  return (r1_km + r2_km) * PHYS.km;
}

/** Star radius in km, scaled from EOS reference. R ∝ M^(-1/3) approx. */
function computeStarRadius(ms, eos) {
  return eos.radiusAt1_4 * Math.pow(ms / 1.4, -1/3);
}

// ========================================================================
// SECTION 4: PHYSICS ENGINE — Gravitational Waves
// References: Maggiore 2007 Ch. 4, Abbott+ 2017 (GW170817)
// ========================================================================

function computeGWFrequency(fOrb) { return 2 * fOrb; }

/** 0PN chirp rate: df/dt = (96/5) π^(8/3) (GMc/c³)^(5/3) f^(11/3) */
function computeGWFreqDot(fgw, Mc) {
  const x = PHYS.G * Mc / Math.pow(PHYS.c, 3);
  return (96/5) * Math.pow(Math.PI, 8/3) * Math.pow(x, 5/3) * Math.pow(fgw, 11/3);
}

/** Strain amplitude: h = (4/dL)(GMc/c²)^(5/3)(πf/c)^(2/3) */
function computeStrain(fgw, Mc, dL) {
  const a = Math.pow(PHYS.G * Mc / (PHYS.c * PHYS.c), 5/3);
  const b = Math.pow(Math.PI * fgw / PHYS.c, 2/3);
  return (4 / dL) * a * b;
}

/** GW power radiated. Peters 1964. */
function computeGWPower(m1s, m2s, a) {
  const m1 = m1s * PHYS.M_sun, m2 = m2s * PHYS.M_sun;
  return (32/5) * Math.pow(PHYS.G, 4) * m1*m1 * m2*m2 * (m1+m2) / (Math.pow(PHYS.c, 5) * Math.pow(a, 5));
}

/** Waveform sample with antenna patterns */
function generateWaveformSample(A, phase, inclination) {
  const ci = Math.cos(inclination);
  return {
    hplus: A * (1 + ci * ci) / 2 * Math.cos(phase),
    hcross: A * ci * Math.sin(phase)
  };
}

// ========================================================================
// SECTION 5: PHYSICS ENGINE — Remnant Determination
// References: Bauswein+ 2013, Hotokezaka+ 2013
// ========================================================================

function determineRemnantType(m1s, m2s, mejecta, eos) {
  const mRem = m1s + m2s - mejecta;
  const mTOV = eos.tovMass;
  const mThresh = eos.thresholdFactor * mTOV;
  const mMaxRot = 1.2 * mTOV; // ~20% increase from uniform rotation
  if (m1s + m2s > mThresh) return 'black_hole';
  if (mRem > mMaxRot) return 'hypermassive_ns';
  if (mRem > mTOV) return 'supramassive_ns';
  return 'stable_ns';
}

function computeRemnantMass(m1s, m2s, mejecta) { return m1s + m2s - mejecta; }

function computeDiskMass(remnantType) {
  const map = { black_hole: 0.001, hypermassive_ns: 0.05, supramassive_ns: 0.10, stable_ns: 0.15 };
  return map[remnantType] || 0.05;
}

const REMNANT_LABELS = { black_hole: 'Black Hole', hypermassive_ns: 'Hypermassive NS', supramassive_ns: 'Supramassive NS', stable_ns: 'Stable NS' };

// ========================================================================
// SECTION 6: PHYSICS ENGINE — Ejecta
// References: Dietrich+ 2017, Radice+ 2018
// ========================================================================

function computeDynamicalEjecta(m1s, m2s, eos) {
  const q = Math.max(m1s, m2s) / Math.min(m1s, m2s);
  return 1e-3 * Math.sqrt(eos.tidalDeformability / 300) / q;
}

function computeWindEjecta(remnantType, diskMass) {
  const fracs = { black_hole: 0.10, hypermassive_ns: 0.30, supramassive_ns: 0.40, stable_ns: 0.40 };
  return (fracs[remnantType] || 0.2) * diskMass;
}

function computeTotalEjecta(m1s, m2s, eos) {
  const remnant = determineRemnantType(m1s, m2s, 0, eos);
  const disk = computeDiskMass(remnant);
  const dyn = computeDynamicalEjecta(m1s, m2s, eos);
  const wind = computeWindEjecta(remnant, disk);
  return { dynamical: dyn, wind, total: dyn + wind, blueEjecta: wind, redEjecta: dyn };
}

// ========================================================================
// SECTION 7: PHYSICS ENGINE — Kilonova
// References: Metzger 2017, Kasen+ 2017, Villar+ 2017 (AT2017gfo)
// ========================================================================

/** r-process heating rate (Metzger 2017): Q̇ ≈ 2e10 * (t/day)^(-1.3) erg/s/g */
function computeHeatingRate(t) {
  const tDay = Math.max(t, 60) / PHYS.day;
  return 2e10 * Math.pow(tDay, -1.3);
}

/** Thermalization efficiency fit */
function computeThermalizationEfficiency(t) {
  const tDay = Math.max(t, 60) / PHYS.day;
  return Math.min(0.5, 0.36 * Math.exp(-0.56 * tDay) + 0.02);
}

/** Kilonova bolometric luminosity for blue/red component */
function computeKilonovaLuminosity(t, mejSolar, component) {
  if (t < 60 || mejSolar < 1e-6) return 0;
  const mej = mejSolar * PHYS.M_sun * 1e3; // grams
  const Q = computeHeatingRate(t);
  const eps = computeThermalizationEfficiency(t);
  const kappa = component === 'blue' ? 1.0 : 10.0;
  const vej = component === 'blue' ? 0.25 * PHYS.c : 0.15 * PHYS.c;
  const tPeak = Math.sqrt(2 * kappa * mej / (vej * PHYS.c * 1e2)) / 100; // CGS
  const tDay = t / PHYS.day;
  const peakDay = tPeak / PHYS.day;
  // Simple rising + declining model
  let scale = 1;
  if (tDay < peakDay * 0.3) scale = Math.pow(tDay / (peakDay * 0.3), 2);
  return mej * Q * eps * scale;
}

/** Effective temperature from luminosity */
function computeEffectiveTemperature(L_ergs, t, v_c) {
  if (t < 60 || L_ergs < 1) return 0;
  const R = v_c * PHYS.c * t * 100; // radius in cm
  const sigma = 5.670e-5; // CGS
  return Math.pow(L_ergs / (4 * Math.PI * R * R * sigma), 0.25);
}

/** Blackbody temperature → approximate RGB */
function temperatureToRGB(T) {
  if (T < 100) return [0.1, 0.1, 0.1];
  const t = T / 100;
  let r, g, b;
  if (t <= 66) {
    r = 1;
    g = Math.max(0, Math.min(1, (0.39008 * Math.log(t) - 0.63184)));
  } else {
    r = Math.max(0, Math.min(1, 1.293 * Math.pow(t - 60, -0.1332)));
    g = Math.max(0, Math.min(1, 1.130 * Math.pow(t - 60, -0.0755)));
  }
  if (t >= 66) b = 1;
  else if (t <= 19) b = 0;
  else b = Math.max(0, Math.min(1, 0.54321 * Math.log(t - 10) - 1.19625));
  return [r, g, b];
}

// ========================================================================
// SECTION 8: PHYSICS ENGINE — Electromagnetic Counterparts
// References: Abbott+ 2017 (multi-messenger), Mooley+ 2018, Margutti+ 2018
// ========================================================================

function computeGRBLuminosity(tPost, viewAngle, jetAngle) {
  if (tPost < 1.5 || tPost > 4.0) return 0;
  const Lcore = 1e50; // erg/s on-axis
  const profile = Math.exp(-0.5 * Math.pow(viewAngle / jetAngle, 2));
  const timeFactor = Math.exp(-Math.pow(tPost - 2.7, 2) / 0.5);
  return Lcore * profile * timeFactor;
}

function computeJetOpeningAngle(bFieldLog) {
  return (5 + (bFieldLog - 12) * 1.5) * Math.PI / 180;
}

function computeXrayFlux(tPost) {
  if (tPost < 9 * PHYS.day) return 0;
  const tDays = tPost / PHYS.day;
  const tPeak = 155;
  const Lpeak = 5e39;
  if (tDays < tPeak) return Lpeak * Math.pow(tDays / tPeak, 0.8);
  return Lpeak * Math.pow(tDays / tPeak, -2.2);
}

function computeRadioFlux(tPost) {
  if (tPost < 16 * PHYS.day) return 0;
  const tDays = tPost / PHYS.day;
  const tPeak = 150;
  const Lpeak = 3e38;
  if (tDays < tPeak) return Lpeak * Math.pow(tDays / tPeak, 0.8);
  return Lpeak * Math.pow(tDays / tPeak, -2.2);
}

function computeNeutrinoLuminosity(tPost) {
  if (tPost < 0 || tPost > 10) return 0;
  return 1e53 * Math.exp(-tPost / 0.3);
}

/** Unified EM band computation */
function computeAllEMBands(tPost, params) {
  const { m1, m2, eos, bfield, viewAngle } = params;
  const ej = computeTotalEjecta(m1, m2, EOS_MODELS[eos]);
  const jetAngle = computeJetOpeningAngle(bfield);
  const blueL = computeKilonovaLuminosity(tPost, ej.blueEjecta, 'blue');
  const redL = computeKilonovaLuminosity(tPost, ej.redEjecta, 'red');
  const blueT = computeEffectiveTemperature(blueL, tPost, 0.25);
  const redT = computeEffectiveTemperature(redL, tPost, 0.15);
  // Distribute kilonova luminosity across UV/optical/IR based on temperature
  const uvFrac = blueT > 8000 ? 0.3 : 0.05;
  const optFrac = blueT > 5000 ? 0.5 : 0.2;
  const irFrac = 1 - uvFrac - optFrac;
  return {
    gamma: computeGRBLuminosity(tPost, viewAngle * Math.PI / 180, jetAngle),
    xray: computeXrayFlux(tPost),
    uv: blueL * uvFrac,
    optical: blueL * optFrac + redL * 0.3,
    infrared: blueL * irFrac + redL * 0.7,
    radio: computeRadioFlux(tPost),
    neutrino: computeNeutrinoLuminosity(tPost),
    totalKN: blueL + redL,
    blueTemp: blueT,
    redTemp: redT,
  };
}

// ========================================================================
// SECTION 9: SIMULATION PHASE & TIME SCALING
// ========================================================================

function getSimulationPhase(tPost) {
  if (tPost < 0) return 'inspiral';
  if (tPost < 0.05) return 'merger';
  if (tPost < 1.5) return 'hypermassive_remnant';
  if (tPost < 5) return 'grb';
  if (tPost < 12) return 'black_hole_formation';
  if (tPost < 0.5 * PHYS.day) return 'expanding_ejecta';
  if (tPost < 2 * PHYS.day) return 'early_kilonova';
  if (tPost < 10 * PHYS.day) return 'peak_kilonova';
  if (tPost < 120 * PHYS.day) return 'afterglow';
  return 'final_remnant';
}

function getAutoTimeScale(tPost) {
  // Continuous cinematic pacing inspired by scientific merger animations.
  if (tPost < -1) return 0.72;
  if (tPost < -0.1) return 0.34;
  if (tPost < 0) return 0.12;
  if (tPost < 1.5) return 0.10;
  if (tPost < 5) return 0.24;
  if (tPost < 30) return 0.75;
  if (tPost < 300) return 8;
  if (tPost < 3600) return 90;
  if (tPost < PHYS.day) return 3200;
  if (tPost < 30 * PHYS.day) return 85000;
  return 650000;
}

const PHASE_NAMES = {
  inspiral: 'INSPIRAL',
  merger: 'MERGER',
  post_merger: 'POST-MERGER',
  hypermassive_remnant: 'HYPERMASSIVE NEUTRON STAR',
  grb: 'GAMMA-RAY BURST',
  black_hole_formation: 'BLACK HOLE FORMATION',
  expanding_ejecta: 'EXPANDING EJECTA',
  early_post_merger: 'REMNANT FORMATION',
  early_kilonova: 'BLUE KILONOVA',
  peak_kilonova: 'RED KILONOVA',
  afterglow: 'X-RAY AND RADIO AFTERGLOW',
  final_remnant: 'FINAL REMNANT'
};

const PHASE_COLORS = {
  inspiral: '#00d4ff',
  merger: '#ff3366',
  post_merger: '#ff8800',
  hypermassive_remnant: '#ffd166',
  grb: '#ffffff',
  black_hole_formation: '#ff6b35',
  expanding_ejecta: '#b388ff',
  early_post_merger: '#ff8800',
  early_kilonova: '#66b3ff',
  peak_kilonova: '#ff5533',
  afterglow: '#ff9f43',
  final_remnant: '#8fa5c5'
};

const EVOLUTION_TEXT = {
  inspiral: ['Inspiral', 'The stars lose orbital energy through gravitational waves and spiral closer together.'],
  merger: ['Collision', 'The stellar crusts collide, shock heating begins, and neutron-rich matter is torn away.'],
  hypermassive_remnant: ['Hypermassive neutron star', 'The merged core is temporarily supported by extremely rapid rotation and thermal pressure. It shines intensely in neutrinos.'],
  grb: ['Jet and gamma-ray burst', 'Magnetic fields help launch narrow relativistic jets along the poles. A jet aimed near Earth can produce a short gamma-ray burst.'],
  black_hole_formation: ['Collapse to a black hole', 'The temporary remnant can no longer resist gravity. It collapses, leaving a black hole surrounded by a hot accretion disk.'],
  expanding_ejecta: ['Expanding ejecta', 'Fast tidal debris and slower winds spread outward. Fresh heavy nuclei begin heating the cloud through radioactive decay.'],
  early_kilonova: ['Blue kilonova', 'Hot, relatively transparent polar ejecta glow first in ultraviolet and blue light.'],
  peak_kilonova: ['Red kilonova and heavy elements', 'The cloud cools and becomes redder. Gold, platinum, uranium, and other heavy elements are carried into space.'],
  afterglow: ['X-ray and radio afterglow', 'The jet and ejecta plough into surrounding gas, creating shocks that can glow for months or years.'],
  final_remnant: ['Final remnant', 'A black hole and fading accretion flow remain at the centre while enriched debris continues drifting into interstellar space.']
};

// ========================================================================
// SECTION 10: EDUCATIONAL CONTENT
// ========================================================================
import { EDUCATIONAL_CONTENT } from './educationalContent.js';

// ========================================================================
// SECTION 11: SIMULATION STATE
// ========================================================================
const state = {
  // User parameters
  params: { m1: 1.4, m2: 1.3, eos: 'SLy', bfield: 12, separation: 200, spin: 0.05, inclination: 30, distance: 40, viewAngle: 30 },
  // Simulation runtime
  playing: false,
  simTime: 0,          // seconds elapsed since sim start
  mergerTime: 0,       // computed time-to-merger from initial separation
  postMergerTime: 0,   // time after merger (can be negative)
  phase: 'inspiral',
  userSpeed: 2.5,
  // Derived physics
  separation: 200000,
  orbitalPhase: 0,
  fOrb: 0, fGW: 0, strain: 0, orbitalVelocity: 0,
  gwPower: 0,
  chirpMass: 0,
  remnantType: '',
  ejecta: { dynamical: 0, wind: 0, total: 0, blueEjecta: 0, redEjecta: 0 },
  emBands: { gamma: 0, xray: 0, uv: 0, optical: 0, infrared: 0, radio: 0, neutrino: 0, totalKN: 0, blueTemp: 0, redTemp: 0 },
  totalEnergy: 0,
  // Waveform buffer
  waveformBuffer: [],
  waveformMaxLen: 600,
  // EM light curve history
  emHistory: [],
  emHistoryMaxLen: 300,
  visualOrbitalPhase: 0,
  visualInspiralDuration: 18,
  initialSeparation: 200 * PHYS.km,
  annotationsEnabled: true,
};

function initSimulation() {
  const { m1, m2, eos, separation, distance } = state.params;
  const eosModel = EOS_MODELS[eos];
  const a0 = separation * PHYS.km;
  state.physicalMergerTime = computeMergerTime(a0, m1, m2);
  // A separate cinematic clock keeps the two bodies visually readable.
  state.mergerTime = state.visualInspiralDuration;
  state.initialSeparation = a0;
  state.simTime = 0;
  state.postMergerTime = -state.mergerTime;
  state.orbitalPhase = 0;
  state.visualOrbitalPhase = 0;
  state.totalEnergy = 0;
  state.chirpMass = computeChirpMass(m1, m2);
  state.ejecta = computeTotalEjecta(m1, m2, eosModel);
  state.remnantType = determineRemnantType(m1, m2, state.ejecta.total, eosModel);
  state.waveformBuffer = [];
  state.emHistory = [];
  state.phase = 'inspiral';
  updatePhysics(0);
}

function updatePhysics(dtReal) {
  const { m1, m2, eos, distance, inclination, bfield, viewAngle } = state.params;
  const eosModel = EOS_MODELS[eos];
  const dL = distance * PHYS.Mpc;

  // Time advancement. Inspiral and the first post-merger seconds use a cinematic
  // clock; late emission then transitions smoothly to the compressed scientific clock.
  let autoScale;
  if (state.postMergerTime < 0) autoScale = 1.0;
  else if (state.postMergerTime < 12) autoScale = 0.42;
  else if (state.postMergerTime < 90) {
    const blend = THREE.MathUtils.smootherstep((state.postMergerTime - 12) / 78, 0, 1);
    autoScale = THREE.MathUtils.lerp(0.42, 12, blend);
  } else {
    const lateScale = getAutoTimeScale(state.postMergerTime);
    const blend = THREE.MathUtils.smootherstep(Math.min(1, (state.postMergerTime - 90) / 600), 0, 1);
    autoScale = THREE.MathUtils.lerp(12, lateScale, blend);
  }
  const dtSim = dtReal * state.userSpeed * autoScale;
  state.simTime += dtSim;
  state.postMergerTime = state.simTime - state.mergerTime;

  const tauRemaining = Math.max(state.mergerTime - state.simTime, 0);
  state.phase = getSimulationPhase(state.postMergerTime);

  if (state.postMergerTime < 0) {
    // PRE-MERGER: inspiral
    const r1m = computeStarRadius(m1, eosModel) * PHYS.km;
    const r2m = computeStarRadius(m2, eosModel) * PHYS.km;
    const contact = computeContactSeparation(r1m / PHYS.km, r2m / PHYS.km);
    const inspiralP = THREE.MathUtils.clamp(state.simTime / state.mergerTime, 0, 1);
    const eased = inspiralP * inspiralP * (3 - 2 * inspiralP);
    state.separation = THREE.MathUtils.lerp(state.initialSeparation, contact, Math.pow(eased, 1.35));
    state.fOrb = computeOrbitalFrequency(state.separation, m1, m2);
    state.fGW = computeGWFrequency(state.fOrb);
    state.strain = computeStrain(state.fGW, state.chirpMass, dL);
    state.orbitalVelocity = computeOrbitalVelocity(state.separation, m1, m2);
    state.gwPower = computeGWPower(m1, m2, state.separation);
    // Keep the data model physical, but cap the displayed angular speed so the
    // scene always reads as two objects rather than repeated motion-blur copies.
    state.orbitalPhase += 2 * Math.PI * state.fOrb * dtSim;
    const visualOmega = THREE.MathUtils.lerp(0.38, 2.25, Math.pow(inspiralP, 2.1));
    state.visualOrbitalPhase += visualOmega * dtReal * state.userSpeed;
    state.totalEnergy += state.gwPower * Math.abs(dtSim);
    // Waveform sample
    const wf = generateWaveformSample(state.strain, state.orbitalPhase, inclination * Math.PI / 180);
    state.waveformBuffer.push({ t: state.postMergerTime, h: wf.hplus, f: state.fGW });
    if (state.waveformBuffer.length > state.waveformMaxLen) state.waveformBuffer.shift();
  } else {
    // POST-MERGER
    const r1 = computeStarRadius(m1, eosModel);
    const r2 = computeStarRadius(m2, eosModel);
    state.separation = computeContactSeparation(r1, r2);
    state.fGW = 0;
    state.strain = 0;
    state.orbitalVelocity = 0;
    state.gwPower = 0;
    // Ringdown waveform (damped sinusoid)
    if (state.postMergerTime < 0.1) {
      const ringA = state.waveformBuffer.length > 0 ? Math.abs(state.waveformBuffer[state.waveformBuffer.length - 1].h) : 1e-22;
      const dampedH = ringA * Math.exp(-state.postMergerTime / 0.01) * Math.cos(2 * Math.PI * 3000 * state.postMergerTime);
      state.waveformBuffer.push({ t: state.postMergerTime, h: dampedH, f: 3000 });
      if (state.waveformBuffer.length > state.waveformMaxLen) state.waveformBuffer.shift();
    }
    // EM bands
    state.emBands = computeAllEMBands(state.postMergerTime, { m1, m2, eos, bfield, viewAngle });
    // EM history
    if (state.postMergerTime > 0.5) {
      const lastT = state.emHistory.length > 0 ? state.emHistory[state.emHistory.length - 1].t : 0;
      if (state.postMergerTime > lastT * 1.05 + 0.5) {
        state.emHistory.push({ t: state.postMergerTime, ...state.emBands });
        if (state.emHistory.length > state.emHistoryMaxLen) state.emHistory.shift();
      }
    }
  }
}

// ========================================================================
// SECTION 12: FORMAT HELPERS
// ========================================================================
function formatTime(t) {
  const abs = Math.abs(t);
  const sign = t < 0 ? '−' : '+';
  if (abs < 0.001) return `${sign}${(abs*1e3).toFixed(1)} ms`;
  if (abs < 1) return `${sign}${(abs*1e3).toFixed(0)} ms`;
  if (abs < 60) return `${sign}${abs.toFixed(1)} s`;
  if (abs < 3600) return `${sign}${(abs/60).toFixed(1)} min`;
  if (abs < PHYS.day) return `${sign}${(abs/3600).toFixed(1)} hr`;
  if (abs < 30 * PHYS.day) return `${sign}${(abs/PHYS.day).toFixed(1)} d`;
  if (abs < 365 * PHYS.day) return `${sign}${(abs/(30*PHYS.day)).toFixed(1)} mo`;
  return `${sign}${(abs/(365*PHYS.day)).toFixed(1)} yr`;
}

function formatSci(v, digits = 1) {
  if (v === 0) return '0';
  if (!isFinite(v)) return '—';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const man = v / Math.pow(10, exp);
  if (Math.abs(exp) <= 2) return v.toFixed(digits);
  return `${man.toFixed(digits)}e${exp}`;
}

// ========================================================================
// SECTION 13: THREE.JS SCENE
// ========================================================================
let scene, camera, renderer, composer, controls;
let star1, star2, spacetimeGrid, ejectaSystem, kilonovaCloud, jet1, jet2, blackHoleMesh, shockWave;
let starField, starGlow1, starGlow2, orbitTrail1, orbitTrail2, remnantGlow;
let gwWaveGroup, mergerCore, mergerHalo, lensingRing;

const VISUAL_SCALE = 0.12; // maps km to Three.js units — 200 km → 24 units
const STAR_EXAGGERATE = 2.5;

function initThreeScene() {
  const canvas = document.getElementById('three-canvas');
  const container = document.getElementById('viewport-panel');

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020208);
  scene.fog = new THREE.FogExp2(0x020208, 0.0022);

  // Camera
  camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(0, 16, 46);
  camera.lookAt(0, 0, 0);

  // Controls
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 130;
  controls.autoRotate = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 0, 0);

  // Lighting
  const ambient = new THREE.HemisphereLight(0x6b86b9, 0x05050c, 0.48);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xbfd9ff, 1.15);
  key.position.set(18, 24, 16);
  scene.add(key);
  const rim = new THREE.PointLight(0x5d6cff, 18, 120, 2);
  rim.position.set(-18, 4, -18);
  scene.add(rim);
  const warm = new THREE.PointLight(0xff7a45, 8, 80, 2);
  warm.position.set(0, -8, 12);
  scene.add(warm);

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.82, 0.42, 0.72
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Create scene objects
  createStarField();
  createNeutronStars();
  createSpacetimeGrid();
  createGravitationalWaves();
  createMergerTransitionObjects();
  createEjectaSystem();
  createKilonovaCloud();
  createJets();
  createBlackHole();
  createShockWave();

  // Resize handler
  window.addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });
}

function createStarField() {
  const geo = new THREE.BufferGeometry();
  const count = 3000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 200 + Math.random() * 800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
    const brightness = 0.3 + Math.random() * 0.7;
    const tint = Math.random();
    colors[i*3] = brightness * (0.8 + tint * 0.2);
    colors[i*3+1] = brightness * (0.85 + tint * 0.15);
    colors[i*3+2] = brightness;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.8, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true });
  starField = new THREE.Points(geo, mat);
  scene.add(starField);
}

function createNeutronStars() {
  // Layered plasma shader: dense luminous surface, subtle convection and a thin atmosphere.
  const starShader = {
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + .1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x);
        f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
                       mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                       mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.55;
        for(int i=0;i<4;i++) {
          v += a * noise(p);
          p = p * 2.03 + 3.1;
          a *= 0.5;
        }
        return v;
      }
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float ndv = max(dot(normalize(vNormal), viewDir), 0.0);
        float limb = smoothstep(0.02, 0.72, ndv);
        float rim = pow(1.0 - ndv, 2.2);
        vec3 p = normalize(vWorldPosition) * 4.2;
        float cells = fbm(p + vec3(uTime * 0.09, -uTime * 0.05, uTime * 0.04));
        float fine = fbm(p * 2.8 - vec3(uTime * 0.18));
        float bands = 0.5 + 0.5 * sin((vUv.y + cells * 0.07) * 58.0 + uTime * 0.35);
        float plasma = clamp(cells * 0.72 + fine * 0.28 + bands * 0.08, 0.0, 1.0);
        vec3 surface = mix(uColor * 0.25, uColor, plasma);
        surface = mix(surface, uHotColor, smoothstep(0.62, 0.96, plasma));
        surface *= (0.5 + limb * 0.95) * uIntensity;
        vec3 atmosphere = uHotColor * rim * 1.35;
        gl_FragColor = vec4(surface + atmosphere, uOpacity);
      }
    `
  };

  const geo = new THREE.SphereGeometry(1, 96, 64);
  const makeMaterial = (base, hot, intensity) => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(base) },
      uHotColor: { value: new THREE.Color(hot) },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uOpacity: { value: 1.0 }
    },
    vertexShader: starShader.vertexShader,
    fragmentShader: starShader.fragmentShader,
    toneMapped: true,
    transparent: true,
    depthWrite: true
  });

  star1 = new THREE.Mesh(geo, makeMaterial(0x5b8edb, 0xd7efff, 1.22));
  star1.userData.label = 'Neutron star 1';
  star1.userData.description = 'Ultra-dense stellar remnant. Its surface and atmosphere are visually amplified.';
  scene.add(star1);

  star2 = new THREE.Mesh(geo, makeMaterial(0x7562cc, 0xf0e7ff, 1.18));
  star2.userData.label = 'Neutron star 2';
  star2.userData.description = 'The companion neutron star. Mass and EOS control its radius and tidal response.';
  scene.add(star2);

  const glowGeo = new THREE.SphereGeometry(1.025, 48, 32);
  const makeGlow = color => new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.032, side: THREE.BackSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  starGlow1 = makeGlow(0x72cfff);
  starGlow2 = makeGlow(0xb18cff);
  scene.add(starGlow1, starGlow2);

  const trailMat1 = new THREE.LineBasicMaterial({ color: 0x57aef2, transparent: true, opacity: 0.26 });
  const trailMat2 = new THREE.LineBasicMaterial({ color: 0x9b7de1, transparent: true, opacity: 0.22 });
  orbitTrail1 = new THREE.Line(new THREE.BufferGeometry(), trailMat1);
  orbitTrail2 = new THREE.Line(new THREE.BufferGeometry(), trailMat2);
  orbitTrail1.userData.points = [];
  orbitTrail2.userData.points = [];
  scene.add(orbitTrail1, orbitTrail2);
}

function createSpacetimeGrid() {
  const size = 80, divisions = 50;
  const geo = new THREE.PlaneGeometry(size, size, divisions, divisions);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a3a5a, wireframe: true, transparent: true, opacity: 0.25 });
  spacetimeGrid = new THREE.Mesh(geo, mat);
  spacetimeGrid.position.y = -4;
  spacetimeGrid._basePositions = geo.attributes.position.array.slice();
  scene.add(spacetimeGrid);
}


function createGravitationalWaves() {
  gwWaveGroup = new THREE.Group();
  gwWaveGroup.rotation.x = Math.PI / 2;
  scene.add(gwWaveGroup);

  for (let i = 0; i < 22; i++) {
    const points = [];
    const segments = 180;
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: i % 2 ? 0x7ae9ff : 0x9d86ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const ring = new THREE.LineLoop(geo, mat);
    ring.userData.phaseOffset = i / 22;
    ring.userData.baseOpacity = 0.11 + (i % 3) * 0.025;
    gwWaveGroup.add(ring);
  }

  // Two faint perpendicular wave sheets make the signal readable from oblique camera angles.
  const sheetMat = new THREE.MeshBasicMaterial({
    color: 0x5aa9ff, transparent: true, opacity: 0.025,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  });
  const sheetGeo = new THREE.RingGeometry(1, 1.08, 192);
  const sheetA = new THREE.Mesh(sheetGeo, sheetMat);
  const sheetB = new THREE.Mesh(sheetGeo, sheetMat.clone());
  sheetB.rotation.y = Math.PI / 2;
  sheetA.userData.isWaveSheet = sheetB.userData.isWaveSheet = true;
  gwWaveGroup.add(sheetA, sheetB);
  gwWaveGroup.userData.sheetA = sheetA;
  gwWaveGroup.userData.sheetB = sheetB;
}

function createMergerTransitionObjects() {
  const coreGeo = new THREE.SphereGeometry(1, 72, 48);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xeaf7ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  mergerCore = new THREE.Mesh(coreGeo, coreMat);
  mergerCore.userData.label = 'Compact merger remnant';
  mergerCore.userData.description = 'The hot central object formed immediately after the two neutron stars merge.';
  mergerCore.visible = false;
  scene.add(mergerCore);

  const haloGeo = new THREE.SphereGeometry(1.25, 48, 32);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x7aa7ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.BackSide, toneMapped: false
  });
  mergerHalo = new THREE.Mesh(haloGeo, haloMat);
  mergerHalo.visible = false;
  scene.add(mergerHalo);

  const lensGeo = new THREE.TorusGeometry(1.9, 0.075, 12, 160);
  const lensMat = new THREE.MeshBasicMaterial({
    color: 0xcfe9ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  lensingRing = new THREE.Mesh(lensGeo, lensMat);
  lensingRing.rotation.x = Math.PI / 2;
  lensingRing.visible = false;
  scene.add(lensingRing);
}

function createEjectaSystem() {
  const count = 8000;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocities = new Float32Array(count * 3); // stored for physics
  const types = new Float32Array(count); // 0=blue(polar), 1=red(equatorial)

  for (let i = 0; i < count; i++) {
    positions[i*3] = positions[i*3+1] = positions[i*3+2] = 0;
    const isBlue = i < count / 2;
    types[i] = isBlue ? 0 : 1;
    if (isBlue) {
      // Polar ejecta — along Y axis with spread
      const speed = 0.15 + Math.random() * 0.15;
      const theta = (Math.random() - 0.5) * 0.8; // deviation from pole
      const phi = Math.random() * Math.PI * 2;
      velocities[i*3] = speed * Math.sin(theta) * Math.cos(phi);
      velocities[i*3+1] = speed * Math.cos(theta) * (Math.random() > 0.5 ? 1 : -1);
      velocities[i*3+2] = speed * Math.sin(theta) * Math.sin(phi);
      colors[i*3] = 0.3; colors[i*3+1] = 0.5; colors[i*3+2] = 1.0;
    } else {
      // Equatorial ejecta — in XZ plane with spread
      const speed = 0.08 + Math.random() * 0.1;
      const theta = Math.random() * Math.PI * 2;
      const ySpread = (Math.random() - 0.5) * 0.3;
      velocities[i*3] = speed * Math.cos(theta);
      velocities[i*3+1] = speed * ySpread;
      velocities[i*3+2] = speed * Math.sin(theta);
      colors[i*3] = 1.0; colors[i*3+1] = 0.3; colors[i*3+2] = 0.1;
    }
    sizes[i] = 0.15 + Math.random() * 0.25;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo._velocities = velocities;
  geo._types = types;

  const mat = new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  ejectaSystem = new THREE.Points(geo, mat);
  ejectaSystem.userData.label = 'Merger ejecta';
  ejectaSystem.userData.description = 'Neutron-rich matter expelled by tidal forces, shocks and disk winds.';
  scene.add(ejectaSystem);
}

function createKilonovaCloud() {
  const group = new THREE.Group();
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({
    color: 0x9bc8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  const outer = new THREE.Mesh(new THREE.SphereGeometry(1.16, 48, 36), new THREE.MeshBasicMaterial({
    color: 0xff7a42, transparent: true, opacity: 0,
    wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  group.add(inner, outer);
  group._inner = inner;
  group._outer = outer;
  group.visible = false;
  group.userData.label = 'Kilonova';
  group.userData.description = 'A radioactive optical/infrared transient produced as merger ejecta expand and cool.';
  inner.userData.hoverSource = group;
  outer.userData.hoverSource = group;
  kilonovaCloud = group;
  scene.add(kilonovaCloud);
}

function createJets() {
  const geo = new THREE.ConeGeometry(1, 8, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  jet1 = new THREE.Mesh(geo, mat.clone());
  jet1.userData.label = 'Relativistic outflow';
  jet1.userData.description = 'A narrow, ultra-fast polar jet that can power a short gamma-ray burst.';
  jet1.position.y = 4;
  scene.add(jet1);

  jet2 = new THREE.Mesh(geo, mat.clone());
  jet2.userData.label = 'Relativistic outflow';
  jet2.userData.description = 'The counter-jet moving in the opposite polar direction.';
  jet2.rotation.x = Math.PI;
  jet2.position.y = -4;
  scene.add(jet2);
}

function createBlackHole() {
  const geo = new THREE.SphereGeometry(1.5, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
  blackHoleMesh = new THREE.Mesh(geo, mat);
  blackHoleMesh.userData.label = 'Black-hole remnant';
  blackHoleMesh.userData.description = 'A compact remnant surrounded by a hot, simplified accretion flow.';
  scene.add(blackHoleMesh);

  // Accretion ring
  const ringGeo = new THREE.TorusGeometry(3, 0.6, 16, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  blackHoleMesh._ring = new THREE.Mesh(ringGeo, ringMat);
  blackHoleMesh._ring.userData.label = 'Accretion disk';
  blackHoleMesh._ring.userData.description = 'Hot merger debris orbiting the compact remnant before falling inward or being expelled.';
  blackHoleMesh._ring.rotation.x = Math.PI / 2;
  scene.add(blackHoleMesh._ring);
}

function createShockWave() {
  const geo = new THREE.RingGeometry(0.5, 1, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  shockWave = new THREE.Mesh(geo, mat);
  shockWave.rotation.x = -Math.PI / 2;
  scene.add(shockWave);
}

const annotationEls = {};
function initSceneAnnotations() {
  ['star1','star2','gw','remnant','blackhole','disk','ejecta','jets','kilonova','radio'].forEach(k => annotationEls[k] = document.getElementById(`ann-${k}`));
  const toggle = document.getElementById('annotation-toggle');
  toggle.addEventListener('click', () => {
    state.annotationsEnabled = !state.annotationsEnabled;
    toggle.classList.toggle('active', state.annotationsEnabled);
    toggle.textContent = state.annotationsEnabled ? 'Labels on' : 'Labels off';
  });
}
function placeAnnotation(el, objectOrPosition, visible, offsetX=0, offsetY=0) {
  if (!el) return;
  visible = visible && state.annotationsEnabled;
  el.classList.toggle('visible', !!visible);
  if (!visible) return;
  const pos = objectOrPosition.isObject3D ? objectOrPosition.getWorldPosition(new THREE.Vector3()) : objectOrPosition.clone();
  pos.project(camera);
  const panel = document.getElementById('viewport-panel');
  const x = (pos.x * .5 + .5) * panel.clientWidth + offsetX;
  const y = (-pos.y * .5 + .5) * panel.clientHeight + offsetY;
  el.style.left = `${Math.max(55, Math.min(panel.clientWidth-55, x))}px`;
  el.style.top = `${Math.max(28, Math.min(panel.clientHeight-28, y))}px`;
}
function updateSceneAnnotations() {
  const pre = state.postMergerTime < 0;
  const merge = state.postMergerTime >= 0 && state.postMergerTime < 5;
  const post = state.postMergerTime >= 0;
  placeAnnotation(annotationEls.star1, star1, pre || (merge && star1.visible), 58, -24);
  placeAnnotation(annotationEls.star2, star2, pre || (merge && star2.visible), -58, 25);
  placeAnnotation(annotationEls.gw, new THREE.Vector3(13, -3.5, 0), pre && state.simTime/state.mergerTime > .18, 18, 0);
  const bhVisible = !!(blackHoleMesh && blackHoleMesh.visible && blackHoleMesh.material.opacity > 0.04);
  const diskVisible = !!(blackHoleMesh?._ring && blackHoleMesh._ring.visible && blackHoleMesh._ring.material.opacity > 0.04);
  const knVisible = !!(kilonovaCloud && kilonovaCloud.visible && kilonovaCloud._inner.material.opacity > 0.025);
  placeAnnotation(annotationEls.remnant, mergerCore, post && mergerCore.visible && !bhVisible, 62, -30);
  placeAnnotation(annotationEls.blackhole, blackHoleMesh, bhVisible, 54, -42);
  placeAnnotation(annotationEls.disk, blackHoleMesh?._ring || new THREE.Vector3(), diskVisible, -72, 30);
  placeAnnotation(annotationEls.ejecta, new THREE.Vector3(9, 1, 1), post && state.postMergerTime > .4 && ejectaSystem.material.opacity > .03, 40, 18);
  placeAnnotation(annotationEls.jets, new THREE.Vector3(0, 12, 0), jet1 && jet1.visible && jet1.material.opacity > .03, 68, -10);
  placeAnnotation(annotationEls.kilonova, new THREE.Vector3(-11, 5, 0), knVisible, -35, -10);
  placeAnnotation(annotationEls.radio, new THREE.Vector3(12, -7, -2), state.postMergerTime > 9 * PHYS.day, 35, 12);
}

// ========================================================================
// SECTION 14: THREE.JS SCENE UPDATE
// ========================================================================

function updateScene(time) {
  const { m1, m2, eos } = state.params;
  const eosModel = EOS_MODELS[eos];
  const r1 = computeStarRadius(m1, eosModel) * VISUAL_SCALE * STAR_EXAGGERATE;
  const r2 = computeStarRadius(m2, eosModel) * VISUAL_SCALE * STAR_EXAGGERATE;
  const visSep = state.separation / PHYS.km * VISUAL_SCALE;

  const preMerger = state.postMergerTime < 0;
  const merging = state.postMergerTime >= 0 && state.postMergerTime < 5.0;
  const postMerger = state.postMergerTime >= 0;

  // === Neutron Stars ===
  if (preMerger) {
    const halfSep = visSep / 2;
    const phase = state.visualOrbitalPhase;
    star1.position.set(halfSep * Math.cos(phase), 0, halfSep * Math.sin(phase));
    star2.position.set(-halfSep * Math.cos(phase), 0, -halfSep * Math.sin(phase));
    star1.scale.setScalar(r1);
    star2.scale.setScalar(r2);
    star1.visible = true;
    star2.visible = true;
    star1.material.uniforms.uTime.value = time;
    star2.material.uniforms.uTime.value = time;
    star1.material.uniforms.uIntensity.value = 1.16;
    star2.material.uniforms.uIntensity.value = 1.13;
    star1.material.uniforms.uOpacity.value = 1.0;
    star2.material.uniforms.uOpacity.value = 1.0;
    // Tidal deformation near merger
    const tauNorm = Math.max(0, (state.mergerTime - state.simTime) / state.mergerTime);
    const tidal = 1 + (1 - tauNorm) * 0.3;
    const tidalDir1 = new THREE.Vector3().subVectors(star2.position, star1.position).normalize();
    star1.scale.set(r1 * (1 + (tidal - 1) * Math.abs(tidalDir1.x)), r1, r1 * (1 + (tidal - 1) * Math.abs(tidalDir1.z)));
    star2.scale.set(r2 * (1 + (tidal - 1) * Math.abs(tidalDir1.x)), r2, r2 * (1 + (tidal - 1) * Math.abs(tidalDir1.z)));
    starGlow1.visible = starGlow2.visible = true;
    starGlow1.position.copy(star1.position); starGlow2.position.copy(star2.position);
    starGlow1.scale.copy(star1.scale).multiplyScalar(1.018);
    starGlow2.scale.copy(star2.scale).multiplyScalar(1.018);

    const updateTrail = (trail, position) => {
      const pts = trail.userData.points;
      pts.push(position.clone());
      if (pts.length > 22) pts.shift();
      trail.geometry.setFromPoints(pts);
    };
    updateTrail(orbitTrail1, star1.position);
    updateTrail(orbitTrail2, star2.position);
    const showTrails = state.simTime / state.mergerTime > 0.72;
    orbitTrail1.visible = orbitTrail2.visible = showTrails;
    orbitTrail1.material.opacity = showTrails ? 0.09 : 0;
    orbitTrail2.material.opacity = showTrails ? 0.075 : 0;
  } else if (merging) {
    // Continuous contact → common envelope → one compact remnant.
    const t = THREE.MathUtils.clamp(state.postMergerTime / 5.0, 0, 1);
    const contact = THREE.MathUtils.smootherstep(t, 0.0, 0.30);
    const coalescence = THREE.MathUtils.smootherstep(t, 0.22, 0.62);
    const remnantGrowth = THREE.MathUtils.smootherstep(t, 0.28, 0.76);
    const lobeFade = 1.0 - THREE.MathUtils.smootherstep(t, 0.31, 0.69);
    const flash = Math.exp(-Math.pow((t - 0.48) / 0.15, 2));

    const spinPhase = state.visualOrbitalPhase + t * 2.4;
    const lobeDistance = Math.max(0, (1.0 - contact) * Math.max(r1, r2) * 0.72);
    const centrePull = 1.0 - coalescence;
    const px = Math.cos(spinPhase) * lobeDistance * centrePull;
    const pz = Math.sin(spinPhase) * lobeDistance * centrePull;
    star1.position.set(px, 0, pz);
    star2.position.set(-px, 0, -pz);

    // The lobes flatten into the same central envelope rather than remaining as
    // two intact touching spheres.
    const radialStretch = THREE.MathUtils.lerp(1.0, 1.52, contact) * THREE.MathUtils.lerp(1.0, 0.54, coalescence);
    const transverse = THREE.MathUtils.lerp(1.0, 0.72, contact) * THREE.MathUtils.lerp(1.0, 0.62, coalescence);
    const lobeScale = Math.max(0.05, lobeFade);
    star1.scale.set(r1 * radialStretch * lobeScale, r1 * transverse * lobeScale, r1 * transverse * lobeScale);
    star2.scale.set(r2 * radialStretch * lobeScale, r2 * transverse * lobeScale, r2 * transverse * lobeScale);
    star1.lookAt(star2.position);
    star2.lookAt(star1.position);
    star1.visible = star2.visible = lobeFade > 0.015;
    star1.material.uniforms.uOpacity.value = lobeFade;
    star2.material.uniforms.uOpacity.value = lobeFade;
    star1.material.uniforms.uIntensity.value = 1.35 + 3.7 * flash + 1.2 * contact;
    star2.material.uniforms.uIntensity.value = 1.30 + 3.5 * flash + 1.1 * contact;

    starGlow1.visible = starGlow2.visible = lobeFade > 0.16;
    starGlow1.position.copy(star1.position); starGlow2.position.copy(star2.position);
    starGlow1.scale.copy(star1.scale).multiplyScalar(1.012);
    starGlow2.scale.copy(star2.scale).multiplyScalar(1.012);
    starGlow1.material.opacity = starGlow2.material.opacity = 0.012 * lobeFade + 0.018 * flash;
    orbitTrail1.visible = orbitTrail2.visible = false;

    mergerCore.visible = remnantGrowth > 0.015;
    mergerHalo.visible = remnantGrowth > 0.01;
    mergerCore.scale.setScalar(0.28 + remnantGrowth * 2.15 + flash * 0.34);
    mergerHalo.scale.setScalar(0.46 + remnantGrowth * 2.75 + flash * 0.62);
    mergerCore.material.opacity = Math.min(0.72, remnantGrowth * 0.48 + flash * 0.32);
    mergerHalo.material.opacity = Math.min(0.17, remnantGrowth * 0.10 + flash * 0.08);
    mergerCore.material.color.setRGB(0.76 + flash * 0.24, 0.86 + flash * 0.14, 1.0);
    mergerHalo.material.color.setRGB(0.34 + flash * 0.42, 0.46 + flash * 0.34, 1.0);
    mergerCore.rotation.y = time * 0.82;
    mergerHalo.rotation.y = -time * 0.34;

    lensingRing.visible = remnantGrowth > 0.35;
    lensingRing.scale.setScalar(0.75 + remnantGrowth * 2.05);
    lensingRing.material.opacity = THREE.MathUtils.smootherstep(remnantGrowth, 0.25, 0.82) * 0.34;
    lensingRing.rotation.z = time * 0.44;
  } else {
    star1.visible = false;
    star2.visible = false;
    starGlow1.visible = false;
    starGlow2.visible = false;
    orbitTrail1.visible = false;
    orbitTrail2.visible = false;
    const remnantHold = postMerger && state.postMergerTime < 14;
    mergerCore.visible = remnantHold;
    mergerHalo.visible = remnantHold;
    lensingRing.visible = remnantHold;
    if (remnantHold) {
      const age = state.postMergerTime - 5;
      const fade = Math.max(0, 1 - age / 9);
      mergerCore.scale.setScalar(2.35 + Math.min(age, 4) * 0.05);
      mergerHalo.scale.setScalar(3.05 + Math.min(age, 4) * 0.11);
      mergerCore.material.opacity = 0.42 * fade;
      mergerHalo.material.opacity = 0.10 * fade;
      lensingRing.material.opacity = 0.22 * fade;
    }
  }

  // === Gravitational waves ===
  if (gwWaveGroup) {
    const signalStrength = preMerger ? THREE.MathUtils.clamp(0.16 + Math.pow(Math.min(state.fGW / 900, 1), 0.8) * 0.84, 0, 1) : Math.max(0, 1 - state.postMergerTime / 0.32);
    const waveSpeed = preMerger ? 0.32 + Math.min(state.fGW / 500, 2.4) : 2.8;
    gwWaveGroup.visible = signalStrength > 0.015;
    gwWaveGroup.children.forEach((ring, index) => {
      if (ring.userData.isWaveSheet) return;
      const cycle = (time * waveSpeed + ring.userData.phaseOffset) % 1;
      const radius = 4.5 + cycle * 58;
      ring.scale.setScalar(radius);
      ring.material.opacity = signalStrength * ring.userData.baseOpacity * Math.pow(1 - cycle, 1.35);
      ring.rotation.z = 0.10 * Math.sin(time * 0.7 + index);
    });
    const sheetPulse = (time * waveSpeed) % 1;
    for (const sheet of [gwWaveGroup.userData.sheetA, gwWaveGroup.userData.sheetB]) {
      sheet.scale.setScalar(7 + sheetPulse * 46);
      sheet.material.opacity = signalStrength * 0.055 * Math.pow(1 - sheetPulse, 1.7);
    }
  }

  // === Spacetime Grid ===
  if (spacetimeGrid && spacetimeGrid._basePositions) {
    const posAttr = spacetimeGrid.geometry.attributes.position;
    const base = spacetimeGrid._basePositions;
    const mass1Pos = star1.visible ? star1.position : new THREE.Vector3(0, 0, 0);
    const mass2Pos = star2.visible ? star2.position : new THREE.Vector3(0, 0, 0);
    const massScale = preMerger ? (m1 + m2) * 0.5 : (postMerger ? (m1 + m2) * 0.7 : 0);

    for (let i = 0; i < posAttr.count; i++) {
      const bx = base[i*3], by = base[i*3+1], bz = base[i*3+2];
      let dy = 0;
      if (massScale > 0) {
        const d1 = Math.sqrt((bx - mass1Pos.x)**2 + (bz - mass1Pos.z)**2) + 1;
        const d2 = Math.sqrt((bx - mass2Pos.x)**2 + (bz - mass2Pos.z)**2) + 1;
        dy = -massScale * (1/d1 + 1/d2) * 2;
        const rr = Math.sqrt(bx*bx + bz*bz);
        const waveAmp = preMerger ? (0.12 + Math.min(state.fGW / 900, 1) * 0.42) : Math.max(0, 0.5 * (1 - state.postMergerTime / 0.4));
        dy += Math.sin(rr * 0.9 - time * (2.2 + Math.min(state.fGW / 280, 7))) * waveAmp * Math.exp(-rr / 30);
      }
      posAttr.setY(i, by + Math.max(dy, -8));
    }
    posAttr.needsUpdate = true;
  }

  // === Shock Wave ===
  if (merging && state.postMergerTime < 4.8) {
    const t = state.postMergerTime / 4.8;
    const onset = THREE.MathUtils.smoothstep(t, 0.18, 0.34);
    shockWave.visible = true;
    shockWave.scale.setScalar(1 + onset * 28);
    shockWave.material.opacity = onset * Math.pow(1 - t, 1.4) * 0.42;
    shockWave.material.color.setRGB(1.0, 0.72 + 0.28 * (1-t), 0.5 + 0.5 * (1-t));
  } else {
    shockWave.visible = false;
  }

  // === Ejecta ===
  if (postMerger && state.postMergerTime > 0.08) {
    const age = Math.max(0, state.postMergerTime - 0.08);
    const ejectaFade = THREE.MathUtils.smootherstep(Math.min(age / 3.8, 1), 0, 1);
    const expansionScale = Math.min(52, Math.log1p(age * 2.2) * 8.4);
    ejectaSystem.material.opacity = ejectaFade * Math.max(0.10, 1 - Math.log1p(age) / 18);
    const positions = ejectaSystem.geometry.attributes.position.array;
    const vels = ejectaSystem.geometry._velocities;
    for (let i = 0; i < positions.length / 3; i++) {
      const swirl = 0.08 * Math.sin(time * 0.8 + i * 0.017) * Math.exp(-age / 40);
      positions[i*3]   = vels[i*3]   * expansionScale - vels[i*3+2] * swirl;
      positions[i*3+1] = vels[i*3+1] * expansionScale;
      positions[i*3+2] = vels[i*3+2] * expansionScale + vels[i*3] * swirl;
    }
    ejectaSystem.geometry.attributes.position.needsUpdate = true;
  } else {
    ejectaSystem.material.opacity = 0;
  }

  // === Kilonova Cloud ===
  if (postMerger && state.postMergerTime > 2.0) {
    kilonovaCloud.visible = true;
    const ageSec = Math.max(0, state.postMergerTime - 2.0);
    const visualAge = Math.log1p(ageSec) / Math.log(1 + 12 * PHYS.day);
    const reveal = THREE.MathUtils.smootherstep(Math.min(ageSec / 8, 1), 0, 1);
    const tDays = Math.max(ageSec / PHYS.day, 1e-5);
    const cinematicAge = Math.min(1, ageSec / 45);
    const knScale = 1.35 + 8.5 * THREE.MathUtils.smootherstep(cinematicAge, 0, 1) + Math.min(30, Math.pow(Math.max(visualAge, 0), 0.72) * 30);
    kilonovaCloud.scale.setScalar(knScale);
    kilonovaCloud.rotation.y = time * 0.012;

    const blueT = state.emBands.blueTemp;
    const redT = state.emBands.redTemp;
    const modelT = Math.max(2500, blueT, redT);
    const coolingT = THREE.MathUtils.lerp(10500, 2800, Math.min(1, visualAge * 1.15));
    const rgb = temperatureToRGB(Math.max(modelT, coolingT));
    const brightnessModel = Math.min(1, state.emBands.totalKN / 1e42);
    const visibleBrightness = Math.max(0.62 * reveal, brightnessModel);
    const redShift = THREE.MathUtils.smootherstep(Math.min(visualAge, 1), 0.18, 0.95);

    kilonovaCloud._inner.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
    kilonovaCloud._inner.material.opacity = reveal * visibleBrightness * (0.34 - 0.10 * redShift);
    kilonovaCloud._outer.material.color.setRGB(0.78 + 0.22 * redShift, 0.48 - 0.23 * redShift, 0.28 - 0.16 * redShift);
    kilonovaCloud._outer.material.opacity = reveal * (0.10 + 0.14 * redShift) * Math.max(0.35, 1 - visualAge * 0.45);
  } else {
    kilonovaCloud.visible = false;
    kilonovaCloud._inner.material.opacity = 0;
    kilonovaCloud._outer.material.opacity = 0;
  }

  // === Jets ===
  if (postMerger && state.postMergerTime > 1.5 && state.postMergerTime < 30) {
    const t = Math.min(1, (state.postMergerTime - 1.5) / 2);
    const fadeOut = state.postMergerTime > 5 ? Math.max(0, 1 - (state.postMergerTime - 5) / 25) : 1;
    const jetAngle = computeJetOpeningAngle(state.params.bfield);
    const jetRadius = Math.tan(jetAngle) * 8;
    jet1.scale.set(jetRadius * t, t, jetRadius * t);
    jet2.scale.set(jetRadius * t, t, jetRadius * t);
    jet1.position.y = 4 * t;
    jet2.position.y = -4 * t;
    jet1.material.opacity = 0.7 * t * fadeOut;
    jet2.material.opacity = 0.5 * t * fadeOut;
    const jetColor = state.postMergerTime < 4 ? 0xffffff : 0x88aaff;
    jet1.material.color.setHex(jetColor);
    jet2.material.color.setHex(jetColor);
    jet1.visible = true; jet2.visible = true;
  } else {
    jet1.visible = false; jet2.visible = false;
  }

  // === Black Hole ===
  const collapseTime = state.remnantType === 'black_hole' ? 3.2 :
                       state.remnantType === 'hypermassive_ns' ? 8.0 :
                       state.remnantType === 'supramassive_ns' ? PHYS.day : Infinity;
  const hasCollapsed = postMerger && state.postMergerTime > collapseTime;
  if (hasCollapsed) {
    blackHoleMesh.visible = true;
    blackHoleMesh._ring.visible = true;
    const t = THREE.MathUtils.smootherstep(Math.min(1, (state.postMergerTime - collapseTime) / Math.max(2.8, collapseTime * 0.25)), 0, 1);
    blackHoleMesh.material.opacity = t;
    const diskFade = Math.max(0.18, 1 - Math.log1p(Math.max(0, state.postMergerTime - collapseTime)) / 22);
    blackHoleMesh._ring.material.opacity = t * 0.68 * diskFade;
    blackHoleMesh._ring.rotation.z = time * 0.5;
  } else if (postMerger && state.postMergerTime > 0.1) {
    blackHoleMesh.visible = false;
    blackHoleMesh._ring.visible = false;
  } else {
    blackHoleMesh.visible = false;
    blackHoleMesh._ring.visible = false;
  }

  // Camera position and OrbitControls target are intentionally left untouched here.
  // This preserves the user's zoom and viewing angle throughout the simulation.
  starField.rotation.y = time * 0.0025;
  controls.update();
  updateSceneAnnotations();
}

// ========================================================================
// SECTION 15: GW WAVEFORM PANEL (Canvas 2D)
// ========================================================================

function initGWPanel() {
  const canvas = document.getElementById('gw-canvas');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width - 16;
  canvas.height = rect.height - 40;
}

function drawGWPanel() {
  const canvas = document.getElementById('gw-canvas');
  if (!canvas.width) initGWPanel();
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = 'rgba(5, 5, 16, 0.95)';
  ctx.fillRect(0, 0, W, H);

  const buf = state.waveformBuffer;
  if (buf.length < 2) {
    ctx.fillStyle = '#556677';
    ctx.font = '12px Inter';
    ctx.fillText('Waiting for signal...', W/2 - 60, H/2);
    return;
  }

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, H/2);
  ctx.lineTo(W - 10, H/2);
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#556677';
  ctx.font = '9px JetBrains Mono';
  ctx.fillText('h(t)', 5, H/2 - 5);
  ctx.fillText('time →', W - 45, H - 5);

  // Find amplitude range
  let maxH = 0;
  for (const s of buf) maxH = Math.max(maxH, Math.abs(s.h));
  if (maxH < 1e-30) maxH = 1e-22;

  // Draw waveform
  ctx.beginPath();
  const margin = 45;
  for (let i = 0; i < buf.length; i++) {
    const x = margin + (i / (buf.length - 1)) * (W - margin - 10);
    const y = H/2 - (buf[i].h / maxH) * (H/2 - 15);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // Color gradient based on frequency
  const gradient = ctx.createLinearGradient(margin, 0, W, 0);
  gradient.addColorStop(0, '#00aa44');
  gradient.addColorStop(0.7, '#00ff88');
  gradient.addColorStop(1, '#ffffff');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Strain scale
  ctx.fillStyle = '#4488aa';
  ctx.font = '8px JetBrains Mono';
  ctx.fillText(`±${formatSci(maxH)}`, 2, 12);

  // Merger line
  if (state.postMergerTime >= -0.5 && state.postMergerTime < 1) {
    const mergerIdx = buf.findIndex(s => s.t >= 0);
    if (mergerIdx > 0) {
      const mx = margin + (mergerIdx / (buf.length - 1)) * (W - margin - 10);
      ctx.strokeStyle = 'rgba(255, 51, 102, 0.6)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, 5);
      ctx.lineTo(mx, H - 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff3366';
      ctx.font = '9px Inter';
      ctx.fillText('MERGER', mx + 4, 14);
    }
  }

  // Frequency readout
  if (state.fGW > 0) {
    ctx.fillStyle = '#00d4ff';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`f = ${state.fGW.toFixed(0)} Hz`, W - 80, 14);
  }
}

// ========================================================================
// SECTION 16: EM SPECTRUM PANEL (Canvas 2D)
// ========================================================================

function drawEMPanel() {
  const canvas = document.getElementById('em-canvas');
  if (!canvas.width) {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 16;
    canvas.height = rect.height - 60;
  }
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = 'rgba(5, 5, 16, 0.95)';
  ctx.fillRect(0, 0, W, H);

  const hist = state.emHistory;
  if (hist.length < 2) {
    ctx.fillStyle = '#556677';
    ctx.font = '12px Inter';
    ctx.fillText(state.postMergerTime < 0 ? 'Pre-merger — no EM emission yet' : 'Collecting data...', W/2 - 90, H/2);
    return;
  }

  // Log-log plot
  const margin = { left: 50, right: 10, top: 10, bottom: 20 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;

  // Time range (log scale)
  const tMin = Math.log10(Math.max(hist[0].t, 1));
  const tMax = Math.log10(Math.max(hist[hist.length-1].t, 10));

  // Luminosity range
  let lMin = 35, lMax = 42;
  for (const h of hist) {
    for (const band of ['gamma','xray','uv','optical','infrared','radio']) {
      if (h[band] > 0) {
        const logL = Math.log10(h[band]);
        lMax = Math.max(lMax, logL + 1);
        lMin = Math.min(lMin, logL - 1);
      }
    }
  }

  const xScale = (logT) => margin.left + ((logT - tMin) / (tMax - tMin || 1)) * plotW;

  // In-plot legend
  const legendItems = [
    ['gamma', '#ffffff', 'γ-ray'], ['xray', '#00ccff', 'X-ray'],
    ['uv', '#9966ff', 'UV'], ['optical', '#ffdd00', 'Optical'],
    ['infrared', '#ff4400', 'Infrared'], ['radio', '#ff8800', 'Radio']
  ];
  ctx.font = '8px Inter';
  let legendX = margin.left + 4;
  const legendY = margin.top + 8;
  for (const [, color, label] of legendItems) {
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY - 6, 9, 2);
    ctx.fillStyle = '#98a8c4';
    ctx.fillText(label, legendX + 12, legendY);
    legendX += ctx.measureText(label).width + 28;
  }

  const yScale = (logL) => margin.top + plotH - ((logL - lMin) / (lMax - lMin || 1)) * plotH;

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let l = Math.ceil(lMin); l <= lMax; l += 2) {
    const y = yScale(l);
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(W - margin.right, y); ctx.stroke();
    ctx.fillStyle = '#445566';
    ctx.font = '8px JetBrains Mono';
    ctx.fillText(`10^${l}`, 5, y + 3);
  }

  // Bands
  const bands = [
    { key: 'gamma', color: '#ffffff' },
    { key: 'xray', color: '#00ccff' },
    { key: 'uv', color: '#9966ff' },
    { key: 'optical', color: '#ffdd00' },
    { key: 'infrared', color: '#ff4400' },
    { key: 'radio', color: '#ff8800' },
  ];

  for (const band of bands) {
    ctx.beginPath();
    let started = false;
    for (const h of hist) {
      if (h[band.key] <= 0) continue;
      const x = xScale(Math.log10(Math.max(h.t, 1)));
      const y = yScale(Math.log10(h[band.key]));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = band.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Time cursor
  if (state.postMergerTime > 1) {
    const cx = xScale(Math.log10(state.postMergerTime));
    ctx.strokeStyle = 'rgba(0,212,255,0.4)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, margin.top); ctx.lineTo(cx, H - margin.bottom); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Axis labels
  ctx.fillStyle = '#556677';
  ctx.font = '8px JetBrains Mono';
  ctx.fillText('L (erg/s)', 5, 10);
  ctx.fillText('time →', W - 45, H - 3);
}

// ========================================================================
// SECTION 17: TIMELINE
// ========================================================================

const TIMELINE_EVENTS = [
  { time: -5, label: 'Inspiral', phase: 'inspiral' },
  { time: -0.1, label: 'Late Inspiral', phase: 'inspiral' },
  { time: 0, label: 'Merger', phase: 'merger' },
  { time: 0.15, label: 'HMNS', phase: 'hypermassive_remnant' },
  { time: 1.7, label: 'GRB', phase: 'grb' },
  { time: 8, label: 'Black hole', phase: 'black_hole_formation' },
  { time: 120, label: 'Ejecta', phase: 'expanding_ejecta' },
  { time: 0.5 * PHYS.day, label: 'Blue KN', phase: 'early_kilonova' },
  { time: 3 * PHYS.day, label: 'Red KN', phase: 'peak_kilonova' },
  { time: 9 * PHYS.day, label: 'X-ray', phase: 'afterglow' },
  { time: 16 * PHYS.day, label: 'Radio', phase: 'afterglow' },
  { time: 155 * PHYS.day, label: 'AG Peak', phase: 'afterglow' },
  { time: 200 * PHYS.day, label: 'Remnant', phase: 'final_remnant' },
];

function initTimeline() {
  const track = document.getElementById('timeline-track');
  for (const evt of TIMELINE_EVENTS) {
    const el = document.createElement('div');
    el.className = 'tl-event';
    el.innerHTML = `<span>${evt.label}</span><div class="dot"></div>`;
    el.dataset.time = evt.time;
    track.appendChild(el);
  }
  layoutTimelineEvents();
}

function layoutTimelineEvents() {
  const track = document.getElementById('timeline-track');
  const events = track.querySelectorAll('.tl-event');
  const W = track.clientWidth;
  events.forEach((el) => {
    const t = parseFloat(el.dataset.time);
    const pct = timeToTimelinePercent(t);
    el.style.left = `${pct * W}px`;
  });
}

function timeToTimelinePercent(t) {
  // Map the full time range (-mergerTime to 200*day) to 0-1 using log-ish scale
  const tMin = -Math.max(10, state.mergerTime);
  const tMax = 200 * PHYS.day;
  if (t <= 0) return 0.15 * (1 + t / Math.abs(tMin)); // -10..0 maps to 0..0.15
  // Post-merger: log scale
  const logT = Math.log10(Math.max(t, 0.01));
  const logMax = Math.log10(tMax);
  return 0.15 + 0.85 * (logT / logMax);
}


function timelinePercentToTime(pct) {
  const p = THREE.MathUtils.clamp(pct, 0, 1);
  const preStart = -Math.max(10, state.mergerTime);
  const tMax = 200 * PHYS.day;
  if (p <= 0.15) return preStart * (1 - p / 0.15);
  const q = (p - 0.15) / 0.85;
  const logMin = Math.log10(0.01);
  const logMax = Math.log10(tMax);
  return Math.pow(10, logMin + q * (logMax - logMin));
}

function rebuildEMHistory(targetPostTime) {
  state.emHistory = [];
  if (targetPostTime <= 0.5) return;
  const bandsParams = { ...state.params };
  const maxT = Math.min(targetPostTime, 200 * PHYS.day);
  const samples = 150;
  const t0 = 0.5;
  const log0 = Math.log(t0);
  const log1 = Math.log(Math.max(t0 + 0.01, maxT));
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const t = Math.exp(log0 + (log1 - log0) * u);
    state.emHistory.push({ t, ...computeAllEMBands(t, bandsParams) });
  }
}

function seekToPostMergerTime(targetPostTime) {
  state.simTime = Math.max(0, state.mergerTime + targetPostTime);
  state.postMergerTime = state.simTime - state.mergerTime;
  state.waveformBuffer = [];
  rebuildEMHistory(state.postMergerTime);
  updatePhysics(0);
  updateInfoPanel();
  updateTimeline();
  drawGWPanel();
  drawEMPanel();
}

function initTimelineScrubbing() {
  const track = document.getElementById('timeline-track');
  let dragging = false;
  const scrub = (event) => {
    const rect = track.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const pct = THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
    seekToPostMergerTime(timelinePercentToTime(pct));
  };
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.classList.add('dragging');
    track.setPointerCapture?.(e.pointerId);
    scrub(e);
  });
  track.addEventListener('pointermove', (e) => { if (dragging) scrub(e); });
  track.addEventListener('pointerup', (e) => {
    dragging = false;
    track.classList.remove('dragging');
    track.releasePointerCapture?.(e.pointerId);
  });
  track.addEventListener('pointercancel', () => {
    dragging = false;
    track.classList.remove('dragging');
  });
}

function updateTimeline() {
  const track = document.getElementById('timeline-track');
  const events = track.querySelectorAll('.tl-event');
  const pct = timeToTimelinePercent(state.postMergerTime);
  const W = track.clientWidth;

  document.getElementById('timeline-progress').style.width = `${pct * 100}%`;
  document.getElementById('timeline-cursor').style.left = `${pct * W}px`;
  document.getElementById('timeline-time-label').textContent = `t = ${formatTime(state.postMergerTime)}`;

  events.forEach((el) => {
    const t = parseFloat(el.dataset.time);
    el.classList.toggle('active', state.postMergerTime >= t);
  });
}

// ========================================================================
// SECTION 18: INFO PANEL UPDATE
// ========================================================================

function updateInfoPanel() {
  const sepKm = state.separation / PHYS.km;
  const velC = state.orbitalVelocity / PHYS.c;
  document.getElementById('info-sep').textContent = state.postMergerTime < 0 ? `${sepKm.toFixed(0)} km` : 'Contact';
  document.getElementById('info-vel').textContent = state.postMergerTime < 0 ? `${velC.toFixed(3)} c` : '—';
  document.getElementById('info-fgw').textContent = state.fGW > 0 ? `${state.fGW.toFixed(0)} Hz` : '—';
  document.getElementById('info-strain').textContent = state.strain > 0 ? formatSci(state.strain) : '—';
  document.getElementById('info-mchirp').textContent = `${(state.chirpMass / PHYS.M_sun).toFixed(3)} M☉`;
  let displayedRemnant = REMNANT_LABELS[state.remnantType] || '—';
  const collapseTimeForInfo = state.remnantType === 'black_hole' ? 3.2 : state.remnantType === 'hypermassive_ns' ? 8.0 : state.remnantType === 'supramassive_ns' ? PHYS.day : Infinity;
  if (state.postMergerTime > collapseTimeForInfo) displayedRemnant = 'Black Hole + Disk';
  document.getElementById('info-remnant').textContent = state.postMergerTime > 0 ? displayedRemnant : '—';
  document.getElementById('info-ejecta').textContent = state.postMergerTime > 0 ? `${formatSci(state.ejecta.total)} M☉` : '—';
  document.getElementById('info-lum').textContent = state.emBands.totalKN > 0 ? `${formatSci(state.emBands.totalKN)} erg/s` : '—';
  const maxT = Math.max(state.emBands.blueTemp, state.emBands.redTemp);
  document.getElementById('info-temp').textContent = maxT > 100 ? `${(maxT).toFixed(0)} K` : '—';
  document.getElementById('info-energy').textContent = state.totalEnergy > 0 ? `${formatSci(state.totalEnergy)} J` : '0';

  // Phase badge
  const phaseName = PHASE_NAMES[state.phase] || state.phase;
  const phaseColor = PHASE_COLORS[state.phase] || '#00d4ff';
  document.getElementById('phase-badge').textContent = phaseName;
  document.getElementById('phase-badge').style.color = phaseColor;
  document.getElementById('phase-badge').style.borderColor = phaseColor;
  document.getElementById('phase-badge').style.background = phaseColor + '22';
  document.getElementById('viewport-phase-label').textContent = phaseName;
  document.getElementById('viewport-phase-label').style.color = phaseColor;
  document.getElementById('viewport-time-label').textContent = `t = ${formatTime(state.postMergerTime)}`;
  const evo = EVOLUTION_TEXT[state.phase] || [phaseName, 'The merger continues to evolve across many different physical timescales.'];
  document.getElementById('evolution-caption').innerHTML = `<strong>${evo[0]}</strong><span class="detail">${evo[1]}</span>`;
}

// ========================================================================
// SECTION 19: CONTROLS BINDING
// ========================================================================

function initControls() {
  const bindings = [
    { id: 'ctrl-m1', param: 'm1', format: v => `${parseFloat(v).toFixed(2)} M☉`, valId: 'val-m1' },
    { id: 'ctrl-m2', param: 'm2', format: v => `${parseFloat(v).toFixed(2)} M☉`, valId: 'val-m2' },
    { id: 'ctrl-bfield', param: 'bfield', format: v => `10^${parseFloat(v).toFixed(0)} G`, valId: 'val-bfield' },
    { id: 'ctrl-sep', param: 'separation', format: v => `${parseInt(v)} km`, valId: 'val-sep' },
    { id: 'ctrl-spin', param: 'spin', format: v => parseFloat(v).toFixed(2), valId: 'val-spin' },
    { id: 'ctrl-incl', param: 'inclination', format: v => `${parseInt(v)}°`, valId: 'val-incl' },
    { id: 'ctrl-dist', param: 'distance', format: v => `${parseInt(v)} Mpc`, valId: 'val-dist' },
  ];

  for (const b of bindings) {
    const el = document.getElementById(b.id);
    el.addEventListener('input', () => {
      state.params[b.param] = parseFloat(el.value);
      document.getElementById(b.valId).textContent = b.format(el.value);
      resetAndRecompute();
    });
  }

  document.getElementById('ctrl-eos').addEventListener('change', (e) => {
    state.params.eos = e.target.value;
    resetAndRecompute();
  });

  // Speed slider (logarithmic)
  const speedSlider = document.getElementById('speed-slider');
  speedSlider.addEventListener('input', () => {
    state.userSpeed = Math.pow(10, parseFloat(speedSlider.value));
    document.getElementById('speed-label').textContent = `${state.userSpeed.toFixed(state.userSpeed < 10 ? 1 : 0)}×`;
  });

  // Playback buttons
  document.getElementById('play-btn').addEventListener('click', () => {
    state.playing = !state.playing;
    document.getElementById('play-btn').textContent = state.playing ? '⏸ Pause' : '▶ Play';
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    state.playing = false;
    document.getElementById('play-btn').textContent = '▶ Play';
    resetAndRecompute();
  });

  // Skip buttons
  document.getElementById('skip-merger').addEventListener('click', () => {
    seekToPostMergerTime(-0.5);
    state.playing = true;
    document.getElementById('play-btn').textContent = '⏸ Pause';
  });
  document.getElementById('skip-kilonova').addEventListener('click', () => {
    seekToPostMergerTime(0.3 * PHYS.day);
    state.playing = true;
    document.getElementById('play-btn').textContent = '⏸ Pause';
  });
  document.getElementById('skip-afterglow').addEventListener('click', () => {
    seekToPostMergerTime(20 * PHYS.day);
    state.playing = true;
    document.getElementById('play-btn').textContent = '⏸ Pause';
  });
}

function resetAndRecompute() {
  initSimulation();
  // Reset ejecta positions
  const positions = ejectaSystem.geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i++) positions[i] = 0;
  ejectaSystem.geometry.attributes.position.needsUpdate = true;
  ejectaSystem.material.opacity = 0;
  kilonovaCloud.visible = false;
  kilonovaCloud._inner.material.opacity = 0;
  kilonovaCloud._outer.material.opacity = 0;
  shockWave.material.opacity = 0;
  jet1.material.opacity = 0; jet2.material.opacity = 0;
  blackHoleMesh.material.opacity = 0;
  blackHoleMesh._ring.material.opacity = 0;
  if (mergerCore) { mergerCore.visible = false; mergerCore.material.opacity = 0; }
  if (mergerHalo) { mergerHalo.visible = false; mergerHalo.material.opacity = 0; }
  if (lensingRing) { lensingRing.visible = false; lensingRing.material.opacity = 0; }
}

// ========================================================================
// SECTION 20: EDUCATIONAL MODAL
// ========================================================================

let eduCurrentIndex = 0;

function initEducation() {
  document.getElementById('learn-btn').addEventListener('click', () => showEduModal(0));
  document.getElementById('edu-close').addEventListener('click', closeEduModal);
  document.getElementById('edu-prev').addEventListener('click', () => showEduModal(eduCurrentIndex - 1));
  document.getElementById('edu-next').addEventListener('click', () => showEduModal(eduCurrentIndex + 1));
  document.getElementById('edu-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEduModal();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEduModal();
    if (e.key === ' ' && !document.getElementById('edu-modal-overlay').classList.contains('visible')) {
      e.preventDefault();
      state.playing = !state.playing;
      document.getElementById('play-btn').textContent = state.playing ? '⏸ Pause' : '▶ Play';
    }
    if (e.key === 'r') {
      state.playing = false;
      document.getElementById('play-btn').textContent = '▶ Play';
      resetAndRecompute();
    }
  });
}

function showEduModal(index) {
  eduCurrentIndex = ((index % EDUCATIONAL_CONTENT.length) + EDUCATIONAL_CONTENT.length) % EDUCATIONAL_CONTENT.length;
  const entry = EDUCATIONAL_CONTENT[eduCurrentIndex];
  document.getElementById('edu-icon').textContent = entry.icon;
  document.getElementById('edu-title').textContent = entry.title;
  document.getElementById('edu-question').textContent = entry.question;
  document.getElementById('edu-explanation').textContent = entry.explanation;
  const eqEl = document.getElementById('edu-equation');
  if (entry.equation) { eqEl.textContent = entry.equation; eqEl.style.display = 'block'; }
  else { eqEl.style.display = 'none'; }
  document.getElementById('edu-counter').textContent = `${eduCurrentIndex + 1} / ${EDUCATIONAL_CONTENT.length}`;
  document.getElementById('edu-modal-overlay').classList.add('visible');
}

function closeEduModal() {
  document.getElementById('edu-modal-overlay').classList.remove('visible');
}

// ========================================================================
// SECTION 21: MAIN ANIMATION LOOP
// ========================================================================

let lastTime = 0;
let frameCount = 0;

function animate(currentTime) {
  requestAnimationFrame(animate);

  const dtMs = lastTime ? currentTime - lastTime : 16;
  lastTime = currentTime;
  const dtReal = Math.min(dtMs / 1000, 0.05); // cap at 50ms to prevent spiral of death
  frameCount++;

  // Physics update
  if (state.playing) {
    updatePhysics(dtReal);
  }

  // 3D scene update
  updateScene(currentTime / 1000);

  // Render
  composer.render();

  // 2D panels (throttled to save CPU)
  if (frameCount % 2 === 0) {
    drawGWPanel();
    drawEMPanel();
    updateTimeline();
    updateInfoPanel();
  }
}

// ========================================================================
// SECTION 22: INITIALIZATION
// ========================================================================

function init() {
  initSimulation();
  initThreeScene();
  initSceneAnnotations();
  initGWPanel();
  initTimeline();
  initTimelineScrubbing();
  initControls();
  initEducation();
  updateInfoPanel();

  // Start animation loop
  requestAnimationFrame(animate);

  console.log('%c🌟 Neutron Star Merger Simulator initialized', 'color: #00d4ff; font-size: 14px; font-weight: bold;');
  console.log(`   Merger time: ${formatTime(-state.mergerTime)} from initial separation`);
  console.log(`   Chirp mass: ${(state.chirpMass / PHYS.M_sun).toFixed(3)} M☉`);
  console.log(`   Remnant: ${REMNANT_LABELS[state.remnantType]}`);
  console.log(`   Total ejecta: ${formatSci(state.ejecta.total)} M☉`);
}

// Wait for fonts then init
document.fonts.ready.then(init);
