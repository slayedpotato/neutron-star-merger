/**
 * Physical constants and simplified neutron-star equation-of-state models.
 * Values are used for an educational, physics-informed visualization.
 */

export const PHYS = {
  G: 6.674e-11,       // m³/(kg·s²)
  c: 2.998e8,          // m/s
  M_sun: 1.989e30,     // kg
  sigma_SB: 5.670e-8,  // Stefan-Boltzmann constant W/(m²·K⁴)
  Mpc: 3.086e22,       // meters per Megaparsec
  km: 1e3,             // meters per km
  day: 86400,           // seconds per day
};

// ========================================================================
// SECTION 2: EQUATION OF STATE MODELS
// References: Lattimer & Prakash 2001, Read et al. 2009, GW170817 (Abbott+ 2017)
// ========================================================================
export const EOS_MODELS = {
  APR4: { name: 'APR4', label: 'Soft', radiusAt1_4: 11.1, tovMass: 2.20, tidalDeformability: 270, thresholdFactor: 1.35, gammaIndex: 2.0 },
  SLy:  { name: 'SLy',  label: 'Medium', radiusAt1_4: 11.7, tovMass: 2.05, tidalDeformability: 300, thresholdFactor: 1.40, gammaIndex: 2.2 },
  H4:   { name: 'H4',   label: 'Stiff', radiusAt1_4: 13.8, tovMass: 2.03, tidalDeformability: 700, thresholdFactor: 1.55, gammaIndex: 2.5 },
  MS1:  { name: 'MS1',  label: 'Very Stiff', radiusAt1_4: 14.9, tovMass: 2.77, tidalDeformability: 1400, thresholdFactor: 1.70, gammaIndex: 3.0 },
};
