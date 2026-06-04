// Section 20: Moon System
import { moons as engineMoons } from '@partybuff/calendar-engine';
import type { MoonPhase as EngineMoonPhase } from '@partybuff/calendar-engine';
import { CONTRAST_MIN_HEADER, STYLES, state_name } from './constants.js';
import { defaults, ensureSettings, getCal, titleCase } from './state.js';
import { _contrast, applyBg } from './color.js';
import { fromSerial, toSerial, todaySerial } from './date-math.js';
import { _monthRangeFromSerial, _renderSyntheticMiniCal, button, esc, handoutWrap, rollingMonthWindow } from './rendering.js';
import { _displayMonthDayParts, _legendLine, _menuBox, _serialToDateSpec, _shiftSerialByMonth, dateLabelFromSerial, formalDateLabelFromSerial, parseDatePrefixForAdd } from './ui.js';
import { send, whisper, whisperParts } from './commands.js';
import { _getPlaneData, getPlanarState, getPlanesState } from './planes.js';
import { getWorld } from './worlds/index.js';
import { getEngineWorld, getEngineWorldId, getMoonOpts, serialToCalendarDate } from './engine-opts.js';

/* ============================================================================
 * SECTION 20) MOON SYSTEM
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// 20a) Moon data
// ---------------------------------------------------------------------------

// Historical candidate-selection notes are archived in README.md and
// DESIGN.md rather than runtime data.
/*
  {
    moon: 'Lharvion',
    currentReferenceMoon: 'Nereid (Neptune)',
    alternateSeenInOlderLore: 'Phoebe (Saturn)',
    reason: 'Current orbital parameters (eccentricity 0.7507, inclination 7.23°) match Nereid, but older lore text referenced Phoebe.'
  }
*/

// ---------------------------------------------------------------------------
// 20a-i) Eberron moon core data (campaign baseline)
// ---------------------------------------------------------------------------
// Canonical Eberron moon values used in this script.
// Fields centralized here for quick reference and to avoid drift:
//   color               -> display color for moon UI badges/chips
//   diameter            -> moon diameter in miles
//   avgOrbitalDistance  -> average orbital distance from Eberron in miles
// NOTE: This section intentionally excludes the longer moon-selection rationale;
// keep that in README.md / DESIGN.md instead of runtime data.
export var EBERRON_MOON_CORE_DATA = {
  Zarantyr:  { color:'#F5F5FA', diameter:1250, avgOrbitalDistance:14300 },
  Olarune:   { color:'#FFC68A', diameter:1000, avgOrbitalDistance:18000 },
  Therendor: { color:'#D3D3D3', diameter:1100, avgOrbitalDistance:39000 },
  Eyre:      { color:'#C0C0C0', diameter:1200, avgOrbitalDistance:52000 },
  Dravago:   { color:'#E6E6FA', diameter:2000, avgOrbitalDistance:77500 },
  Nymm:      { color:'#FFD96B', diameter:900,  avgOrbitalDistance:95000 },
  Lharvion:  { color:'#F5F5F5', diameter:1350, avgOrbitalDistance:125000 },
  Barrakas:  { color:'#F0F8FF', diameter:1500, avgOrbitalDistance:144000 },
  Rhaan:     { color:'#9AC0FF', diameter:800,  avgOrbitalDistance:168000 },
  Sypheros:  { color:'#696969', diameter:1100, avgOrbitalDistance:183000 },
  Aryth:     { color:'#FF4500', diameter:1300, avgOrbitalDistance:195000 },
  Vult:      { color:'#A9A9A9', diameter:1800, avgOrbitalDistance:252000 }
};

export function _eberronMoonCore(moonName){
  return EBERRON_MOON_CORE_DATA[moonName] || { color:'#CCCCCC', diameter:1000, avgOrbitalDistance:100000 };
}

export var MOON_SYSTEMS = {
  eberron: {
    id: 'eberron',
    moons: [
      // ── ZARANTYR ── The Storm Moon ─────────────────────────────────
      // Analog: Luna (Earth's Moon). The reference moon — pearly white,
      // moderate eccentricity, wide inclination sweep. Closest and most
      // influential on tides. Kythri = chaos; storms rage when full.
      // Real Luna: ecc 0.0549, inc 5.145°, albedo 0.12.
      { name:'Zarantyr', title:'The Storm Moon',    color:_eberronMoonCore('Zarantyr').color, associatedMonth:1,  plane:'Kythri',   dragonmark:'Mark of Storm',
        synodicPeriod:27.32, diameter:_eberronMoonCore('Zarantyr').diameter, distance:_eberronMoonCore('Zarantyr').avgOrbitalDistance,
        inclination:5.145, eccentricity:0.0549, albedo:0.12,
        epochSeed:{ defaultSeed:'kythri', referenceDate:{year:998,month:1,day:1} } },

      // ── OLARUNE ── The Sentinel Moon ───────────────────────────────
      // Analog: Titan (Saturn). The most natural moon — thick atmosphere,
      // methane rain, seasons, lakes. Orange haze hides the surface from
      // view: the sentinel who watches unseen. Low inclination, steady.
      // Real Titan: ecc 0.0288, inc 0.33°, albedo 0.22.
      { name:'Olarune', title:'The Sentinel Moon', color:_eberronMoonCore('Olarune').color, associatedMonth:2,  plane:'Lamannia', dragonmark:'Mark of Sentinel',
        synodicPeriod:30.8052, diameter:_eberronMoonCore('Olarune').diameter, distance:_eberronMoonCore('Olarune').avgOrbitalDistance,
        inclination:0.33, eccentricity:0.0288, albedo:0.22,
        epochSeed:{ defaultSeed:'lamannia', referenceDate:{year:998,month:1,day:1} } },

      // ── THERENDOR ── The Healer's Moon ─────────────────────────────
      // Analog: Europa (Jupiter). Smooth ice shell over a warm subsurface
      // ocean — the healer's calm exterior with life-sustaining depth
      // beneath. Youngest surface of the Galileans: constantly renewed
      // (healing). In 1:2:4 resonance with Ganymede/Nymm → connected
      // to order. Bright reflective ice = gentle healing light.
      // Real Dione: ecc 0.0022, inc 0.03°, albedo 0.99.
      { name:'Therendor',title:"The Healer's Moon", color:_eberronMoonCore('Therendor').color, associatedMonth:3,  plane:'Syrania',  dragonmark:'Mark of Healing',
        synodicPeriod:34.7350, diameter:_eberronMoonCore('Therendor').diameter, distance:_eberronMoonCore('Therendor').avgOrbitalDistance,
        inclination:0.03, eccentricity:0.0022, albedo:0.99,
        epochSeed:{ defaultSeed:'syrania', referenceDate:{year:998,month:1,day:1} } },

      // ── EYRE ── The Anvil ──────────────────────────────────────────
      // Analog: Mimas (Saturn). Heavily cratered "Death Star" moon with
      // the giant Herschel crater = a forge mark. Bright icy surface
      // (albedo 0.96) reflects Fernia's fire. In 4:3 resonance with
      // Titan/Olarune → nature feeds the forge.
      // Real Mimas: ecc 0.0196, inc 1.53°, albedo 0.96.
      { name:'Eyre',title:'The Anvil',         color:_eberronMoonCore('Eyre').color, associatedMonth:4,  plane:'Fernia',   dragonmark:'Mark of Making',
        synodicPeriod:39.1661, diameter:_eberronMoonCore('Eyre').diameter, distance:_eberronMoonCore('Eyre').avgOrbitalDistance,
        inclination:1.53, eccentricity:0.0196, albedo:0.96,
        epochSeed:{ defaultSeed:'fernia', referenceDate:{year:998,month:1,day:1} } },

      // ── DRAVAGO ── The Herder's Moon ───────────────────────────────
      // Analog: Triton (Neptune). Retrograde orbit (inc 156.8°) —
      // moves against every other moon, embodying Risia's opposition
      // to natural order. Near-zero eccentricity = frozen stasis.
      // Nitrogen ice surface, high albedo. The herder watches from
      // a crystalline vantage, circling in eternal counter-motion.
      // Largest moon by diameter. Lavender = planar tint over ice.
      // Real Triton: ecc 0.000016, inc 156.8°, albedo 0.76.
      { name:'Dravago',title:"The Herder's Moon", color:_eberronMoonCore('Dravago').color, associatedMonth:5,  plane:'Risia',    dragonmark:'Mark of Handling',
        synodicPeriod:44.1625, diameter:_eberronMoonCore('Dravago').diameter, distance:_eberronMoonCore('Dravago').avgOrbitalDistance,
        inclination:156.8, eccentricity:0.000016, albedo:0.76,
        epochSeed:{ defaultSeed:'risia', referenceDate:{year:998,month:1,day:1} } },

      // ── NYMM ── The Crown ──────────────────────────────────────────
      // Analog: Ganymede (Jupiter). LARGEST moon in the solar system —
      // a crown jewel. The ONLY moon with its own magnetic field:
      // sovereign authority, self-contained order. In perfect 1:2:4
      // Laplace resonance with Europa/Therendor and Io → mathematical
      // perfection = Daanvi. Near-circular orbit, near-equatorial.
      // Gold = Daanvi's planar influence, not geology.
      // Real Ganymede: ecc 0.0013, inc 0.20°, albedo 0.43.
      { name:'Nymm',title:'The Crown',         color:_eberronMoonCore('Nymm').color, associatedMonth:6,  plane:'Daanvi',   dragonmark:'Mark of Hospitality',
        synodicPeriod:49.7962, diameter:_eberronMoonCore('Nymm').diameter, distance:_eberronMoonCore('Nymm').avgOrbitalDistance,
        inclination:0.20, eccentricity:0.0013, albedo:0.43,
        epochSeed:{ defaultSeed:'daanvi', referenceDate:{year:998,month:1,day:1} },
        nodePrecession:{ period:336, navigable:true } },

      // ── LHARVION ── The Eye ────────────────────────────────────────
      // Analog: Hyperion (Saturn). The ONLY confirmed chaotic tumbler
      // in the solar system — never shows the same face twice. Sponge-
      // like surface pocked with deep craters. Unpredictable rotation
      // embodies Xoriat's madness. Moderate eccentricity (0.123) gives
      // noticeable brightness variation. Dark, low albedo.
      // Dull white with 750-mile black chasm → the Eye.
      // Real Hyperion: ecc 0.1230, inc 0.43°, albedo 0.30.
      { name:'Lharvion',title:'The Eye',           color:_eberronMoonCore('Lharvion').color, associatedMonth:7,  plane:'Xoriat',   dragonmark:'Mark of Detection',
        synodicPeriod:56.1487, diameter:_eberronMoonCore('Lharvion').diameter, distance:_eberronMoonCore('Lharvion').avgOrbitalDistance,
        inclination:0.43, eccentricity:0.1230, albedo:0.30,
        epochSeed:{ defaultSeed:'xoriat', referenceDate:{year:998,month:1,day:1} } },

      // ── BARRAKAS ── The Lantern ────────────────────────────────────
      // Analog: Enceladus (Saturn). THE brightest body in the solar
      // system — geometric albedo 1.375 (backscattering from pure ice
      // exceeds a flat-disk model). Ice geysers feed Saturn's E-ring.
      // Near-equatorial orbit lights all latitudes equally. The Lantern
      // of Irian needs no magical amplification: real physics already
      // gives it supernatural brightness. Slight ecc for gentle pulsing.
      // Real Enceladus: ecc 0.0047, inc 0.02°, albedo 1.375.
      { name:'Barrakas',title:'The Lantern',       color:_eberronMoonCore('Barrakas').color, associatedMonth:8,  plane:'Irian',    dragonmark:'Mark of Finding',
        synodicPeriod:63.3115, diameter:_eberronMoonCore('Barrakas').diameter, distance:_eberronMoonCore('Barrakas').avgOrbitalDistance,
        inclination:0.02, eccentricity:0.0047, albedo:1.375,
        epochSeed:{ defaultSeed:'irian', referenceDate:{year:998,month:1,day:1} } },

      // ── RHAAN ── The Book ──────────────────────────────────────────
      // Analog: Miranda (Uranus). The "Frankenstein moon" — shattered
      // and reassembled, its patchwork surface looks like pages from
      // different books stitched together. Three coronae with chevron
      // patterns. Verona Rupes = tallest cliff in the solar system.
      // Named after Shakespeare's Tempest character — the only HUMAN
      // among Uranus's fairy-named moons. Once tumbled chaotically
      // (like Hyperion) during a past 3:1 resonance with Umbriel, but
      // now calm: stories of violence written on a peaceful face.
      // Orbits a sideways planet → extreme seasonal illumination.
      // Smallest Eberron moon. Blue = Thelanis fey light through
      // ancient stone. The Book carries every story on its skin.
      // Real Miranda: ecc 0.0013, inc 4.34°, albedo 0.32.
      { name:'Rhaan',title:'The Book',          color:_eberronMoonCore('Rhaan').color, associatedMonth:9,  plane:'Thelanis', dragonmark:'Mark of Scribing',
        synodicPeriod:71.3881, diameter:_eberronMoonCore('Rhaan').diameter, distance:_eberronMoonCore('Rhaan').avgOrbitalDistance,
        inclination:4.34, eccentricity:0.0013, albedo:0.32,
        epochSeed:{ defaultSeed:'thelanis', referenceDate:{year:998,month:1,day:1} } },

      // ── SYPHEROS ── The Shadow ─────────────────────────────────────
      // Analog: Phobos (Mars). The closest and fastest martian moon —
      // dark, small, and named for fear itself. Its tidally decaying
      // orbit suggests a body already being consumed, which fits Mabar's
      // entropy. Low-inclination prograde orbit, modest eccentricity,
      // and very dark albedo keep it ominous without making it backward.
      // Real Phobos: ecc 0.0151, inc 1.08°, albedo 0.071.
      { name:'Sypheros',title:'The Shadow',        color:_eberronMoonCore('Sypheros').color, associatedMonth:10, plane:'Mabar',     dragonmark:'Mark of Shadow',
        synodicPeriod:80.4950, diameter:_eberronMoonCore('Sypheros').diameter, distance:_eberronMoonCore('Sypheros').avgOrbitalDistance,
        inclination:1.08, eccentricity:0.0151, albedo:0.071 },

      // ── ARYTH ── The Gateway ───────────────────────────────────────
      // Analog: Iapetus (Saturn). THE two-tone moon — leading hemisphere
      // coal-black (albedo 0.05), trailing hemisphere bright (0.50).
      // A literal gateway between light and dark, life and death.
      // 13km equatorial ridge = a threshold between realms. HIGHEST
      // inclination of any regular Saturnian moon (7.57°) → sees both
      // extremes of the sky. Walnut-shaped. Dark reddish-brown leading
      // side matches #FF4500 burnt orange-red. Coated in dark material
      // shed by Sypheros: the Shadow marks the Gateway.
      // Real Iapetus: ecc 0.0283, inc 7.57°, albedo 0.275 (averaged; not tidally locked, both faces visible).
      { name:'Aryth',title:'The Gateway',       color:_eberronMoonCore('Aryth').color, associatedMonth:11, plane:'Dolurrh',   dragonmark:'Mark of Passage',
        synodicPeriod:90.7637, diameter:_eberronMoonCore('Aryth').diameter, distance:_eberronMoonCore('Aryth').avgOrbitalDistance,
        inclination:7.57, eccentricity:0.0283, albedo:0.275,
        epochSeed:{ defaultSeed:'dolurrh', referenceDate:{year:998,month:1,day:1} } },

      // ── VULT ── The Warding Moon ───────────────────────────────────
      // Analog: Oberon (Uranus). Outermost major Uranian moon — the
      // outer ward. Heavily cratered from endless bombardment = scars
      // of eternal war (Shavarath). Dark deposits fill crater floors.
      // An 11km mountain = fortress on the frontier. Named for
      // Shakespeare's fairy king in A Midsummer Night's Dream: the
      // warrior-king who holds the line. Near-circular, near-equatorial
      // = disciplined, unwavering patrol. Gray with reddish tint.
      // Real Oberon: ecc 0.0014, inc 0.07°, albedo 0.23.
      { name:'Vult',title:'The Warding Moon',  color:_eberronMoonCore('Vult').color, associatedMonth:12, plane:'Shavarath', dragonmark:'Mark of Warding',
        synodicPeriod:102.3424, diameter:_eberronMoonCore('Vult').diameter, distance:_eberronMoonCore('Vult').avgOrbitalDistance,
        inclination:0.07, eccentricity:0.0014, albedo:0.23,
        epochSeed:{ defaultSeed:'shavarath', referenceDate:{year:998,month:1,day:1} } }
    ]
  },

  // =========================================================================
  // FAERUNIAN — Selûne (single moon of Toril)
  // =========================================================================
  // Selûne: full at midnight Hammer 1, 1372 DR. 30.4375-day period.
  // 48 synodic cycles = 1461 days = exactly 4 Harptos years (incl. Shieldmeet).
  // Phase is perfectly self-resetting on the four-year leap cycle.
  // ~2000 miles diameter, ~183,000 miles distance. Similar apparent size to Earth's moon.
  // Bright enough to cast pale shadows. Associated with lycanthropy, navigation, tides.
  // Trailed by the Tears of Selûne (asteroid cluster, visible flavor).
  faerunian: {
    id: 'faerunian',
    name: 'Toril',
    description: "Selûne, the silver moon of Toril. 30.4375-day cycle aligned to the Harptos leap year.",
    moons: [
      { name:'Selûne', title:'The Moonmaiden', color:'#C8D8F0', associatedMonth:null,
        synodicPeriod:30.4375, diameter:2000, distance:183000,
        inclination:5.1, eccentricity:0.054, albedo:0.25,
        epochSeed:{ defaultSeed:'selune', referenceDate:{year:1372,month:1,day:1} },
        loreNote:'Full at midnight Hammer 1, 1372 DR. Trailed by the Tears of Selûne. Associated with lycanthropy, divination, navigation, and tides.',
        deity:'Selûne' }
    ]
  },

  // =========================================================================
  // GREGORIAN — Luna (Earth's moon)
  // =========================================================================
  // Standard astronomical reference. Synodic period 29.53059 days.
  // Anchor: full moon on January 28, 2021 (a known astronomical full moon).
  // Albedo 0.12, diameter 2159 miles, distance 238855 miles.
  gregorian: {
    id: 'gregorian',
    name: 'Earth',
    description: "Luna, Earth's moon. Standard synodic period 29.53059 days.",
    moons: [
      { name:'Luna', title:'The Moon', color:'#DCDCDC', associatedMonth:null,
        synodicPeriod:29.53059, diameter:2159, distance:238855,
        inclination:5.14, eccentricity:0.0549, albedo:0.12,
        epochSeed:{ defaultSeed:'luna', referenceDate:{year:2021,month:1,day:28} },
        loreNote:'Earth\'s natural satellite. Synodic period 29.53 days. Governs tides and has inspired mythology across all human cultures.' }
    ]
  },

  // =========================================================================
  // GREYHAWK — Luna and Celene (moons of Oerth)
  // =========================================================================
  greyhawk: {
    id: 'greyhawk',
    name: 'Oerth',
    description: "Luna (28-day cycle) and Celene (91-day cycle), the two moons of Oerth.",
    moons: [
      { name:'Luna', title:'The Great Moon', color:'#F5F5DC', associatedMonth:null,
        synodicPeriod:28, loreNote:'Oerth\'s larger moon. Its 28-day cycle aligns perfectly with the calendar months.' },
      { name:'Celene', title:'The Handmaiden', color:'#B0E0E6', associatedMonth:null,
        synodicPeriod:91, loreNote:'Oerth\'s smaller, aquamarine-hued moon. Its 91-day cycle is watched by druids and astrologers.' }
    ]
  },

  // =========================================================================
  // DRAGONLANCE — Three moons of Krynn
  // =========================================================================
  dragonlance: {
    id: 'dragonlance',
    name: 'Krynn',
    description: "Solinari, Lunitari, and Nuitari — the three moons of Krynn that govern magic.",
    moons: [
      { name:'Solinari', title:'The Silver Moon', color:'#E8E8E8', associatedMonth:null,
        synodicPeriod:36, loreNote:'Solinari governs Good magic on Krynn. Its 36-day cycle determines the power of White Robed wizards.' },
      { name:'Lunitari', title:'The Red Moon', color:'#CD5C5C', associatedMonth:null,
        synodicPeriod:28, loreNote:'Lunitari governs Neutral magic on Krynn. Its 28-day cycle matches the calendar months.' },
      { name:'Nuitari', title:'The Black Moon', color:'#1A1A2E', associatedMonth:null,
        synodicPeriod:8, loreNote:'Nuitari governs Evil magic on Krynn. Its rapid 8-day cycle is invisible to all but those who serve darkness.' }
    ]
  },

  // =========================================================================
  // EXANDRIA — Catha and Ruidus
  // =========================================================================
  exandria: {
    id: 'exandria',
    name: 'Exandria',
    description: "Catha (the guiding light) and Ruidus (the bloody eye) — the moons of Exandria.",
    moons: [
      { name:'Catha', title:'The Guiding Light', color:'#F0E6D6', associatedMonth:null,
        synodicPeriod:29, loreNote:'Catha is Exandria\'s primary moon, associated with the Moonweaver, Sehanine.' },
      { name:'Ruidus', title:'The Bloody Eye', color:'#8B0000', associatedMonth:null,
        synodicPeriod:164, loreNote:'Ruidus is a small reddish-purple moon shrouded in mystery. It appears full when visible and is considered an ill omen.' }
    ]
  },

  // =========================================================================
  // MYSTARA — Matera and Patera
  // =========================================================================
  mystara: {
    id: 'mystara',
    name: 'Mystara',
    description: "Matera (visible) and Patera (invisible) — the moons of Mystara.",
    moons: [
      { name:'Matera', title:'The Visible Moon', color:'#F5F5DC', associatedMonth:null,
        synodicPeriod:28, loreNote:'Matera is the primary visible moon of Mystara. Its 28-day cycle governs tides and is the basis of the common month.' },
      { name:'Patera', title:'The Invisible Moon', color:'#4A4A6A', associatedMonth:null,
        synodicPeriod:32, loreNote:'Patera is the invisible moon of Mystara, home to the Ee\'aar. Only visible to those with special sight or powerful magic.' }
    ]
  },

  // =========================================================================
  // BIRTHRIGHT — Aelies (single moon of Aebrynis)
  // =========================================================================
  birthright: {
    id: 'birthright',
    name: 'Aebrynis',
    description: "Aelies, the silver moon of Aebrynis. 32-day cycle matching the Cerilian months.",
    moons: [
      { name:'Aelies', title:'The Silver Moon', color:'#C0C0C0', associatedMonth:null,
        synodicPeriod:32, loreNote:'Aelies is the single moon of Aebrynis. Its 32-day cycle matches the regular months of the Cerilian calendar.' }
    ]
  }
};

/**
 * Central moon-system accessor.
 * Returns the moon system for the active calendarSystem, or null if the world
 * has no moons defined. Eliminates the old Eberron-fallback pattern.
 */
export function _getMoonSys(sysKeyOverride?){
  var key = sysKeyOverride || ensureSettings().calendarSystem;
  var world = getWorld(String(key || '').toLowerCase());
  if (world && world.moons && Array.isArray(world.moons.bodies) && world.moons.bodies.length){
    var legacy = MOON_SYSTEMS[key] || null;
    var legacyByName = Object.create(null);
    if (legacy && Array.isArray(legacy.moons)){
      legacy.moons.forEach(function(moon){
        legacyByName[moon.name] = moon;
      });
    }
    return {
      id: (legacy && legacy.id) || key,
      name: (legacy && legacy.name) || world.label,
      description: (legacy && legacy.description) || world.description,
      moons: world.moons.bodies.map(function(body: any){
        var prior = legacyByName[body.name] || {};
        var mergedData = Object.assign({}, prior.data || {}, body.data || {});
        return Object.assign({}, prior, mergedData, body, {
          key: body.key || prior.key || String(body.name || '').toLowerCase(),
          name: body.name || prior.name,
          title: body.title || prior.title,
          color: body.color || prior.color,
          associatedMonth: body.associatedMonth == null ? (prior.associatedMonth == null ? null : prior.associatedMonth) : body.associatedMonth,
          synodicPeriod: Number(body.synodicPeriod || body.baseCycleDays || prior.synodicPeriod || prior.baseCycleDays || 28),
          siderealPeriod: body.siderealPeriod || prior.siderealPeriod || null,
          baseCycleDays: Number(body.baseCycleDays || body.synodicPeriod || prior.baseCycleDays || prior.synodicPeriod || 28),
          phaseMode: body.phaseMode || prior.phaseMode || 'standard_phase',
          cycleMode: body.cycleMode || prior.cycleMode || 'fixed',
          visibilityMode: body.visibilityMode || prior.visibilityMode || 'normal',
          cycleFormula: body.cycleFormula || prior.cycleFormula || null,
          diameter: body.diameter || prior.diameter,
          distance: body.distance || prior.distance,
          inclination: body.inclination || prior.inclination,
          eccentricity: body.eccentricity || prior.eccentricity,
          albedo: body.albedo || prior.albedo,
          epochSeed: body.epochSeed || prior.epochSeed || mergedData.epochSeed || null,
          orbitalData: body.orbitalData || prior.orbitalData || mergedData.orbitalData || null,
          motionTuning: body.motionTuning || prior.motionTuning || mergedData.motionTuning || null,
          fixedAnchor: body.fixedAnchor || prior.fixedAnchor || mergedData.fixedAnchor || null,
          data: mergedData
        });
      })
    };
  }
  return MOON_SYSTEMS[key] || null;
}

// Dragonlance Night-of-the-Eye and per-moon fixed-anchor resolution
// previously lived here. Both are engine-owned as of PR 2c: the engine
// consumes `state.imported.krynnAnchor` / `state.imported.lunarAnchors`
// via the `PhaseOptions` bag from `getMoonOpts()`. The wrapper no longer
// resolves anchors locally.

// ---------------------------------------------------------------------------
// 20b) State helpers
// ---------------------------------------------------------------------------

// `state.PartyBuffCalendar.moons` is largely vestigial after PR 2c —
// the engine carries no per-wrapper state. We keep the slot for
// compatibility (existing campaigns may still have one persisted) and
// for the surviving `recentHistory.bySerial` chat-history cache used by
// ui.ts when stamping moon icons onto the rolling 3-month view. All
// other fields (`sequences`, `systemSeed`, `systemAnchors`,
// `gmAnchors`, `generatedFrom`, `generatedThru`, `modelRevision`) are
// retained as init-safe defaults so old persisted blobs don't crash
// renders, but nothing writes to them any more.
export function getMoonState(){
  var root = state[state_name];
  if (!root.moons) root.moons = {
    sequences: {},
    systemSeed: null,
    systemAnchors: {},
    gmAnchors: {},
    generatedFrom: null,
    generatedThru: 0,
    modelRevision: 1,
    recentHistory: { bySerial: {}, minSerial: null, maxSerial: null }
  };
  var ms = root.moons;
  if (!ms.recentHistory || typeof ms.recentHistory !== 'object'){
    ms.recentHistory = { bySerial: {}, minSerial: null, maxSerial: null };
  }
  if (!ms.recentHistory.bySerial || typeof ms.recentHistory.bySerial !== 'object'){
    ms.recentHistory.bySerial = {};
  }
  return ms;
}

function _cloneMoonMiniCalEvents(events){
  if (!Array.isArray(events)) return [];
  return events.map(function(evt: any){
    var copy: any = {
      serial: evt && isFinite(evt.serial) ? (evt.serial|0) : 0,
      name: String(evt && evt.name || ''),
      color: evt && evt.color
    };
    if (evt && evt.dotOnly) copy.dotOnly = true;
    if (evt && evt.planeFill) copy.planeFill = true;
    if (evt && evt.isRemote) copy.isRemote = true;
    if (evt && evt.splitColor) copy.splitColor = evt.splitColor;
    if (evt && evt.splitIsRemote) copy.splitIsRemote = true;
    if (evt && evt.replaceNumeral) copy.replaceNumeral = evt.replaceNumeral;
    return copy;
  });
}

function _reindexMoonHistory(history){
  if (!history || !history.bySerial || typeof history.bySerial !== 'object'){
    return { bySerial: {}, minSerial: null, maxSerial: null };
  }
  var min = null;
  var max = null;
  Object.keys(history.bySerial).forEach(function(key){
    var serial = parseInt(key, 10);
    if (!isFinite(serial)){
      delete history.bySerial[key];
      return;
    }
    if (min == null || serial < min) min = serial;
    if (max == null || serial > max) max = serial;
  });
  history.minSerial = min;
  history.maxSerial = max;
  return history;
}

function _moonHistoryState(){
  return _reindexMoonHistory(getMoonState().recentHistory);
}

function _storeMoonHistorySnapshot(ms, snapshot){
  if (!snapshot || !isFinite(snapshot.serial)) return null;
  var history = _moonHistoryState();
  var key = String(snapshot.serial|0);
  history.bySerial[key] = snapshot;
  if (history.minSerial == null || snapshot.serial < history.minSerial) history.minSerial = snapshot.serial|0;
  if (history.maxSerial == null || snapshot.serial > history.maxSerial) history.maxSerial = snapshot.serial|0;
  ms.recentHistory = history;
  return snapshot;
}

export function _moonHashStr(str){
  // String -> deterministic float 0..1
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h / 4294967296;
}

// Seeded dice roller — deterministic from serial + salt string.
// Returns 1..sides (inclusive). Recognizably D&D: d4, d6, d8, d10, d12, d20, d100.

// ---------------------------------------------------------------------------
// 20c) Constants surfaced to other modules
// ---------------------------------------------------------------------------

// `MOON_PREDICTION_LIMITS.highMaxDays` bounds the engine's `nextEvent`
// horizon scan; the wrapper used to pre-generate two years of phases at
// init, but the engine computes phases closed-form, so this is now
// purely a forecast-lookahead cap. `MOON_HISTORY_DAYS` is the chat-
// history window length used by ui.ts when stamping moon icons onto
// the rolling 3-month view. `MOON_PRE_GENERATE_YEARS` is kept as a
// no-op compatibility export — no pre-generation happens any more.
export var MOON_PRE_GENERATE_YEARS = 2;
export var MOON_PREDICTION_LIMITS = {
  lowDays: 2,
  mediumMaxDays: 280,
  highMaxDays: 672
};
export var MOON_HISTORY_DAYS = 60;

// ---------------------------------------------------------------------------
// 20g) Ensure sequences are generated / up to date
// ---------------------------------------------------------------------------

// No-op shim. The legacy wrapper pre-generated a multi-year buffer of
// full/new inflection points per moon and ran festival nudges /
// anti-phase coupling / planar pulls across it; all of that math now
// lives in `@partybuff/calendar-engine` and is computed closed-form
// per phaseOf() call. Callers can keep invoking moonEnsureSequences()
// freely — it's free.
//
// Kept exported because ui.ts / today.ts / commands.ts still call it
// before render to mirror the old "warm the cache" pattern. Removing
// those call sites is a follow-up cleanup; until then this empty body
// satisfies the contract.
export function moonEnsureSequences(_focusSerial?, _horizonExtraDays?){
  return;
}

// ---------------------------------------------------------------------------
// 20h) Phase interpolation & display helpers
// ---------------------------------------------------------------------------

// Resolve a wrapper moon name (e.g. "Olarune") to the engine's lowercase
// moon key (e.g. "olarune"). The engine's `worlds.get(id).moons` array
// is the canonical key→name mapping; we cache one lookup per (world,
// name) pair so the rendering hot path stays cheap.
var _moonKeyByNameCache: { [world: string]: { [name: string]: string } } = {};
function _moonKeyForName(moonName: string): string | null {
  try {
    var world = getEngineWorld();
    var byName = _moonKeyByNameCache[world.id];
    if (!byName){
      byName = Object.create(null);
      for (var i = 0; i < world.moons.length; i++){
        byName[world.moons[i].name] = world.moons[i].key;
      }
      _moonKeyByNameCache[world.id] = byName;
    }
    return byName[moonName] || null;
  } catch (_e){
    return null;
  }
}

// Internal alias kept so external imports of `_moonPhaseAtRaw` (init.ts
// REPL surface, legacy callers) still resolve to the new shim.
export function _moonPhaseAtRaw(moonName, serial){
  return moonPhaseAt(moonName, serial);
}

// Public moonPhaseAt — delegate to the engine.
// Returns the legacy `{illum, waxing}` shape augmented with the engine's
// canonical `label` and inflection flags. Callers that already used
// `_moonPhaseLabel(ph.illum, ph.waxing)` keep working; callers that
// want the engine's verdict directly can read `ph.label` / `ph.isFull`.
export function moonPhaseAt(moonName, serial): any {
  var key = _moonKeyForName(moonName);
  if (!key) return { illum:0.5, waxing:true, label:'New', isFull:false, isNew:false };
  try {
    var worldId = getEngineWorldId();
    var date = serialToCalendarDate(serial);
    var phase: EngineMoonPhase = engineMoons.phaseOf(worldId, key, date, getMoonOpts());
    return {
      illum: phase.illumination,
      waxing: phase.waxing,
      label: phase.label,
      isFull: phase.isFull,
      isNew: phase.isNew,
    };
  } catch (_e){
    return { illum:0.5, waxing:true, label:'New', isFull:false, isNew:false };
  }
}

// Returns the engine's inflection-day verdict for this moon on this serial.
// Returns 'full', 'new', or null. Single-day inflections: no multi-day
// spans regardless of cycle length.
export function _moonPeakPhaseDay(moonName, serial){
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  try {
    var worldId = getEngineWorldId();
    var date = serialToCalendarDate(serial);
    var phase = engineMoons.phaseOf(worldId, key, date, getMoonOpts());
    if (phase.isFull) return 'full';
    if (phase.isNew) return 'new';
    return null;
  } catch (_e){
    return null;
  }
}

// Engine model is inflection-only — every full/new is a single day, so
// "Day X of Y" suffixes don't apply. Kept exported so callers that still
// reference these get a stable no-op return shape during the migration.
export function _moonPhaseSpan(_moonName, _serial){
  return null;
}

export function _moonPhaseSpanSuffix(_moonName, _serial){
  return '';
}

// Look ahead from `serial` for the next inflection day of either type
// in the next `maxDays` days. Returns `{ type:'full'|'new', days:N }`
// for the nearer of the two, or null.
export function _moonNextThresholdEntry(moonName, serial, maxDays){
  maxDays = Math.max(0, maxDays|0);
  if (maxDays <= 0) return null;
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  try {
    var worldId = getEngineWorldId();
    var fromDate = serialToCalendarDate(serial);
    var opts = getMoonOpts();
    var nextFull = engineMoons.nextEvent(worldId, key, fromDate, 'full', maxDays, opts);
    var nextNew  = engineMoons.nextEvent(worldId, key, fromDate, 'new',  maxDays, opts);
    var fullSer = nextFull ? toSerial(nextFull.year, _calendarDateMonthIndex(nextFull), 'day' in nextFull ? nextFull.day : 1) : null;
    var newSer  = nextNew  ? toSerial(nextNew.year,  _calendarDateMonthIndex(nextNew),  'day' in nextNew  ? nextNew.day  : 1) : null;
    var picked: { type: string; ser: number } | null = null;
    if (fullSer != null) picked = { type: 'full', ser: fullSer };
    if (newSer != null && (picked == null || newSer < picked.ser)) picked = { type: 'new', ser: newSer };
    if (!picked) return null;
    var d = picked.ser - serial;
    if (d <= 0) return null;
    return { type: picked.type, days: d };
  } catch (_e){
    return null;
  }
}

// Engine CalendarDate → wrapper structural-mi. Used inside
// _moonNextThresholdEntry / _moonNextEvent so we can return a wrapper
// serial. Reverse of `serialToCalendarDate`.
function _calendarDateMonthIndex(date: any): number {
  // Find the structural slot whose translation matches this engine date.
  var sysKey = String(ensureSettings().calendarSystem || 'eberron');
  var arr = getCal().months;
  for (var i = 0; i < arr.length; i++){
    var m = arr[i] as any;
    if (date.kind === 'month'){
      if (!m.isIntercalary && m.engineMonthIndex === date.monthIndex) return i;
    } else {
      if (m.isIntercalary && m.intercalaryKey === date.intercalaryKey) return i;
    }
  }
  // Fallback: structural slot lookup via the world overlay (older calendar
  // blobs may not have engineMonthIndex inlined on each month slot).
  var slot = _structuralSlotIndex(sysKey, date);
  return slot != null ? slot : 0;
}

function _structuralSlotIndex(sysKey: string, date: any): number | null {
  var months = getCal().months;
  // Best-effort name-based match for legacy state blobs.
  if (date.kind === 'month'){
    for (var i = 0; i < months.length; i++){
      var m = months[i] as any;
      if (m.isIntercalary) continue;
      if (m.regularIndex === date.monthIndex) return i;
    }
  } else {
    for (var j = 0; j < months.length; j++){
      var m2 = months[j] as any;
      if (!m2.isIntercalary) continue;
      if ((m2.key || '').toLowerCase() === String(date.intercalaryKey).toLowerCase()) return j;
    }
  }
  void sysKey;
  return null;
}

// Tight inflection bands. The engine's `isFull` / `isNew` verdicts land
// on exactly one serial per cycle (peak illumination). These thresholds
// only matter to label / emoji helpers that receive a bare
// `(illum, waxing)` pair without the engine's verdict; we render "Full" /
// "New" close enough to peak that the visual aligns with `phase.isFull`.
// Callers that already have an engine `MoonPhase` should read
// `phase.label` instead --- see `moonPhaseAt` above. The legacy
// `MOON_TARGET_FULL_DAYS_PER_28` / `_phaseThresholdForCoverage` coverage
// model is retired: the engine doesn't use illum thresholds, so we
// can't tune the wrapper's label to a "target days per month" either.
export var MOON_FULL_THRESHOLD = 0.98;
export var MOON_NEW_THRESHOLD = 0.02;

export function _moonPhaseLabel(illum, waxing){
  if (illum >= MOON_FULL_THRESHOLD) return 'Full';
  if (illum >= 0.55) return (waxing ? 'Waxing' : 'Waning') + ' Gibbous';
  if (illum >= 0.45) return (waxing ? 'First' : 'Last')    + ' Quarter';
  if (illum >  MOON_NEW_THRESHOLD)  return (waxing ? 'Waxing' : 'Waning') + ' Crescent';
  return 'New';
}

export function _moonPhaseEmoji(illum, waxing){
  if (illum >= MOON_FULL_THRESHOLD) return '\uD83C\uDF15';   // 🌕 Full
  if (illum >= 0.55) return waxing ? '\uD83C\uDF14' : '\uD83C\uDF16';  // 🌔 🌖 Gibbous
  if (illum >= 0.45) return waxing ? '\uD83C\uDF13' : '\uD83C\uDF17';  // 🌓 🌗 Quarter
  if (illum >  MOON_NEW_THRESHOLD)  return waxing ? '\uD83C\uDF12' : '\uD83C\uDF18';  // 🌒 🌘 Crescent
  return '\uD83C\uDF11';  // 🌑 New
}

export function _moonNextEvent(moonName, serial, type){
  // Returns the wrapper serial of the next inflection of `type` strictly
  // after `serial`, or null if none within MOON_PREDICTION_LIMITS.highMaxDays.
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  try {
    var worldId = getEngineWorldId();
    var fromDate = serialToCalendarDate(serial);
    var horizon = MOON_PREDICTION_LIMITS.highMaxDays;
    var result = engineMoons.nextEvent(worldId, key, fromDate, type, horizon, getMoonOpts());
    if (!result) return null;
    return toSerial(result.year, _calendarDateMonthIndex(result), 'day' in result ? result.day : 1);
  } catch (_e){
    return null;
  }
}

// Returns the wrapper serial of the most recent inflection of `type`
// strictly before `serial`, or null if none within ~2 cycles.
//
// The engine's `nextEvent` is forward-only by design (the synodic-period
// math is closed-form, so any "previous" semantics would be a thin
// wrapper anyway). We scan day-by-day backward up to twice the longest
// supported cycle (Eberron Vult is ~28d; multi-month worlds top out
// well under 70d). Engine `phaseOf` is O(1) per call so this is cheap.
export function _moonLastEvent(moonName, serial, type){
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  var maxLookback = 70;
  for (var d = 1; d <= maxLookback; d++){
    var s = serial - d;
    if (_moonPeakPhaseDay(moonName, s) === type) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 20i) Moon forecast helpers
// ---------------------------------------------------------------------------

// Format a "next event" string. Players and the GM see the same forecast.
export function _moonNextEventStr(moon, today, type, _tier, horizonDays){
  var exact = _moonNextEvent(moon.name, today, type);
  if (exact === null) return null;
  var d = Math.ceil(exact - today);
  if (d <= 0) return null;

  var label = (type === 'full') ? 'Full' : 'New';
  var cap = MOON_PREDICTION_LIMITS.highMaxDays;
  var horizon = parseInt(horizonDays, 10);
  if (!isFinite(horizon) || horizon < 1){
    horizon = 84;
  }
  horizon = Math.min(cap, horizon);
  function inDays(n){
    return (n === 1) ? 'in 1 day' : ('in ' + n + ' days');
  }
  if (d > horizon){
    return label + ': beyond prediction';
  }

  return label + ' ' + inDays(d);
}

// Render a single moon row. Players and the GM see the same content.
export function _moonRowHtml(moon, today, _tier, horizonDays){
  var ph       = moonPhaseAt(moon.name, today);
  var label    = _moonPhaseLabel(ph.illum, ph.waxing);
  var emoji    = _moonPhaseEmoji(ph.illum, ph.waxing);
  var pct      = Math.round(ph.illum * 100);

  // Find next event to display
  var nextFull = _moonNextEventStr(moon, today, 'full', 'high', horizonDays);
  var nextNew  = _moonNextEventStr(moon, today, 'new', 'high', horizonDays);
  var nextStr  = '';

  // Pick the closer event
  var dFull = _moonNextEvent(moon.name, today, 'full');
  var dNew  = _moonNextEvent(moon.name, today, 'new');
  if (dFull !== null && (dNew === null || dFull <= dNew))
    nextStr = nextFull || '';
  else if (dNew !== null)
    nextStr = nextNew || '';

  var dot = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;'+
            'background:'+esc(moon.color||'#aaa')+';border:1px solid rgba(0,0,0,.3);'+
            'margin-right:3px;vertical-align:middle;"></span>';
  var nameStyle = '';

  // Moon ascendancy: brighter when associated plane is coterminous, dimmer when remote.
  // Lharvion (Xoriat) is never marked "dim" because Xoriat is always remote — there is
  // no baseline vs dim distinction; it only has ascendant (named month) and normal.
  // A moon can be both dim (plane remote) AND ascendant (named month) simultaneously.
  var ascendTag = '';
  var planarTag = '';
  var monthTag = '';
  if (moon.plane && ensureSettings().planesEnabled !== false){
    try {
      var _plSt = getPlanarState(moon.plane, today);
      if (_plSt && _plSt.phase === 'coterminous')
        planarTag = ' <span style="' +
          applyBg('font-size:.75em;padding:0 3px;border-radius:3px;', '#FFE8A3', CONTRAST_MIN_HEADER) +
          '" title="'+esc(moon.plane)+' coterminous">✨ ascendant</span>';
      else if (_plSt && _plSt.phase === 'remote' && moon.name !== 'Lharvion')
        planarTag = ' <span style="opacity:.4;font-size:.75em;" title="'+esc(moon.plane)+' remote">◌ dim</span>';
    } catch(e){ /* planar system not ready */ }
  }
  // Also ascendant during its associated month
  if (moon.associatedMonth){
    try {
      var _curCal = getCal().current;
      if (_curCal && (_curCal.month + 1) === moon.associatedMonth)
        monthTag = ' <span style="' +
          applyBg('font-size:.75em;padding:0 3px;border-radius:3px;', '#FFE8A3', CONTRAST_MIN_HEADER) +
          '">✨ ascendant</span>';
    } catch(e){}
  }
  // Combine: show both if both apply (dim plane + ascendant month)
  ascendTag = planarTag + (monthTag && monthTag !== planarTag ? monthTag : (!planarTag ? monthTag : ''));

  // Phase + illumination + next/secondary event.
  var infoParts = [emoji + ' ' + esc(label) + ' (' + pct + '%)'];

  var result = '<div style="margin:3px 0;line-height:1.4;">'+
    dot+
    '<b style="min-width:82px;display:inline-block;'+nameStyle+'">'+esc(moon.name)+'</b>'+
    '<span style="opacity:.9;">'+infoParts.join('')+'</span>'+
    ascendTag;

  if (nextStr){
    result += '<span style="opacity:.45;font-size:.82em;margin-left:8px;">'+esc(nextStr)+'</span>';
  }

  // Show the secondary event too.
  var secStr = '';
  if (dFull !== null && (dNew === null || dFull <= dNew))
    secStr = nextNew || '';
  else
    secStr = nextFull || '';
  if (secStr){
    result += '<span style="opacity:.35;font-size:.78em;margin-left:6px;">'+esc(secStr)+'</span>';
  }

  result += '</div>';
  return result;
}

// Returns true when the moon system has only one moon that should drive cell
// fills (single-moon mini-cal style).  Exandria has two moons but Ruidus uses
// a visibility window and shouldn't control cell colours — only Catha should.
export function _isSingleFillMoon(sys){
  if (!sys || !sys.moons) return true;
  // Count moons whose lore doesn't mark them as visibility-window-only.
  // The inline MOON_SYSTEMS data doesn't carry visibilityMode, so we match
  // by name against known visibility-window moons.
  var VISIBILITY_WINDOW_MOONS = { Ruidus: true };
  var fillCount = 0;
  for (var i = 0; i < sys.moons.length; i++){
    if (!VISIBILITY_WINDOW_MOONS[sys.moons[i].name]) fillCount++;
  }
  return fillCount <= 1;
}

function _moonMiniCalDayEvents(serial, _tier, _baseHorizonDays?, opts?){
  opts = opts || {};
  var sys = opts.sys || _getMoonSys();
  var out = [];
  if (!sys || !sys.moons || !sys.moons.length) return out;
  var ser = serial|0;
  var singleFill = (opts.singleFill !== undefined) ? !!opts.singleFill : _isSingleFillMoon(sys);
  var fullMoons = [];
  var newMoons = [];

  for (var i = 0; i < sys.moons.length; i++){
    var moon = sys.moons[i];
    var peakType = _moonPeakPhaseDay(moon.name, ser);
    if (peakType === 'full'){
      var span = _moonPhaseSpan(moon.name, ser);
      var spanTag = (span && span.totalDays > 1) ? ' Day ' + span.dayNum + '/' + span.totalDays : '';
      fullMoons.push(moon.name + spanTag);
    } else if (peakType === 'new'){
      var span2 = _moonPhaseSpan(moon.name, ser);
      var spanTag2 = (span2 && span2.totalDays > 1) ? ' Day ' + span2.dayNum + '/' + span2.totalDays : '';
      newMoons.push(moon.name + spanTag2);
    }
  }

  // Multi-moon systems: dot-only indicators (no cell fill).
  // Single-fill systems: cell fill + emoji numeral replacement on peak days.
  if (!singleFill){
    if (fullMoons.length){
      out.push({
        serial: ser,
        name: 'Full: ' + fullMoons.join(', '),
        color: '#FFD700',
        dotOnly: true
      });
    }
    if (newMoons.length){
      out.push({
        serial: ser,
        name: 'New: ' + newMoons.join(', '),
        color: '#222222',
        dotOnly: true
      });
    }
  } else {
    if (fullMoons.length){
      out.push({
        serial: ser,
        name: 'Full: ' + fullMoons.join(', '),
        color: '#FFD700',
        replaceNumeral: '\uD83C\uDF15'
      });
    }
    if (newMoons.length){
      out.push({
        serial: ser,
        name: 'New: ' + newMoons.join(', '),
        color: '#222222',
        replaceNumeral: '\uD83C\uDF11'
      });
    }
  }

  return out;
}

export function captureMoonHistoryDay(serial){
  var st = ensureSettings();
  if (st.moonsEnabled === false) return null;
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length) return null;
  var ms = getMoonState();
  var ser = serial|0;
  moonEnsureSequences(ser, MOON_PREDICTION_LIMITS.highMaxDays);
  var snapshot = {
    serial: ser,
    modelRevision: ms.modelRevision,
    miniCalEvents: _cloneMoonMiniCalEvents(_moonMiniCalDayEvents(ser, 'high', MOON_PREDICTION_LIMITS.highMaxDays, {
      sys: sys,
      today: ser,
      singleFill: _isSingleFillMoon(sys)
    }))
  };
  return _storeMoonHistorySnapshot(ms, snapshot);
}

export function captureMoonHistoryWindow(startSerial, endSerial){
  var st = ensureSettings();
  if (st.moonsEnabled === false) return _moonHistoryState();
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length) return _moonHistoryState();
  var start = startSerial|0;
  var end = endSerial|0;
  if (end < start){ var tmp = start; start = end; end = tmp; }
  if (end < start) return _moonHistoryState();
  moonEnsureSequences(end, MOON_PREDICTION_LIMITS.highMaxDays);
  var ms = getMoonState();
  var singleFill = _isSingleFillMoon(sys);
  for (var ser = start; ser <= end; ser++){
    _storeMoonHistorySnapshot(ms, {
      serial: ser,
      modelRevision: ms.modelRevision,
      miniCalEvents: _cloneMoonMiniCalEvents(_moonMiniCalDayEvents(ser, 'high', MOON_PREDICTION_LIMITS.highMaxDays, {
        sys: sys,
        today: ser,
        singleFill: singleFill
      }))
    });
  }
  return _moonHistoryState();
}

export function pruneMoonHistory(referenceSerial?){
  var ms = getMoonState();
  var history = _moonHistoryState();
  var ref = isFinite(referenceSerial) ? (referenceSerial|0) : todaySerial();
  var keepMin = ref - (MOON_HISTORY_DAYS - 1);
  var keepMax = ref;
  Object.keys(history.bySerial).forEach(function(key){
    var serial = parseInt(key, 10);
    var day = history.bySerial[key];
    if (!isFinite(serial) || serial < keepMin || serial > keepMax || !day || day.modelRevision !== ms.modelRevision){
      delete history.bySerial[key];
    }
  });
  ms.recentHistory = _reindexMoonHistory(history);
  return ms.recentHistory;
}

export function resetMoonHistory(referenceSerial?, seedToday?){
  var ms = getMoonState();
  ms.recentHistory = {
    bySerial: {},
    minSerial: null,
    maxSerial: null
  };
  if (seedToday === false) return ms.recentHistory;
  var ref = isFinite(referenceSerial) ? (referenceSerial|0) : todaySerial();
  captureMoonHistoryDay(ref);
  return pruneMoonHistory(ref);
}

// The legacy invalidation chain (sequence cache, derived caches,
// modelRevision bump) is a no-op now that the engine is closed-form
// per-call. Kept exported because today.ts still calls it after date
// mutations — the surviving work is reseeding the recentHistory
// window so subsequent renders show fresh moon icons.
export function invalidateMoonModel(seedToday?){
  return resetMoonHistory(todaySerial(), seedToday);
}

// ---------------------------------------------------------------------------
// Single-moon mini-calendar — shows one moon's phases across a month.
// Cells are color-filled with the phase emoji; no dots needed.
// ---------------------------------------------------------------------------

// Phase-to-color mapping for single-moon cells.


export function _moonTodaySummaryHtml(today, _tier, horizonDays){
  var st = ensureSettings();
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length) return '';
  var horizon = parseInt(horizonDays, 10);
  if (!isFinite(horizon) || horizon < 1){
    horizon = 84;
  }
  var horizonEnd = today + horizon;

  var fullNow = [];
  var newNow = [];
  var best = null;

  for (var i = 0; i < sys.moons.length; i++){
    var moon = sys.moons[i];
    var ph = moonPhaseAt(moon.name, today);
    if (!ph) continue;
    var _pt = _moonPeakPhaseDay(moon.name, today);
    if (_pt === 'full'){
      var _sp = _moonPhaseSpan(moon.name, today);
      fullNow.push(moon.name + ((_sp && _sp.totalDays > 1) ? ' Day ' + _sp.dayNum + '/' + _sp.totalDays : ''));
    }
    if (_pt === 'new'){
      var _sp2 = _moonPhaseSpan(moon.name, today);
      newNow.push(moon.name + ((_sp2 && _sp2.totalDays > 1) ? ' Day ' + _sp2.dayNum + '/' + _sp2.totalDays : ''));
    }

    var fSer = _moonNextEvent(moon.name, today, 'full');
    var nSer = _moonNextEvent(moon.name, today, 'new');
    if (fSer != null && fSer > today && fSer <= horizonEnd && (!best || fSer < best.serial)){
      best = { serial:fSer, moon:moon.name, type:'full', str:_moonNextEventStr(moon, today, 'full', 'high', horizon) };
    }
    if (nSer != null && nSer > today && nSer <= horizonEnd && (!best || nSer < best.serial)){
      best = { serial:nSer, moon:moon.name, type:'new', str:_moonNextEventStr(moon, today, 'new', 'high', horizon) };
    }
  }

  var bits = [];
  if (fullNow.length) bits.push('🌕 Full Moons: ' + fullNow.join(', '));
  if (newNow.length) bits.push('🌑 New Moons: ' + newNow.join(', '));
  if (best){
    bits.push('Next: ' + (best.str || (best.moon + ' ' + titleCase(best.type))));
  }
  if (!bits.length) return '';
  return '<div style="font-size:.8em;opacity:.72;margin:2px 0 6px 0;">'+esc(bits.join(' · '))+'</div>';
}

function _moonCompactStatusLines(today){
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length) return [];
  var lines = [];
  for (var i = 0; i < sys.moons.length; i++){
    var moon = sys.moons[i];
    var ph = moonPhaseAt(moon.name, today);
    if (!ph) continue;
    var emoji = _moonPhaseEmoji(ph.illum, ph.waxing);
    var peakType = _moonPeakPhaseDay(moon.name, today);
    if (peakType === 'full'){
      lines.push(emoji + ' <b>' + esc(moon.name) + '</b> is Full' + esc(_moonPhaseSpanSuffix(moon.name, today)));
      continue;
    }
    if (peakType === 'new'){
      lines.push(emoji + ' <b>' + esc(moon.name) + '</b> is New' + esc(_moonPhaseSpanSuffix(moon.name, today)));
      continue;
    }
    var nextEntry = _moonNextThresholdEntry(moon.name, today, 2);
    if (nextEntry){
      lines.push(
        (nextEntry.type === 'full' ? '🌕' : '🌑') +
        ' <b>' + esc(moon.name) + '</b> ' +
        (nextEntry.type === 'full' ? 'Full ' : 'New ') +
        (nextEntry.days === 1 ? 'tomorrow' : 'in 2 days')
      );
    }
  }
  return lines;
}

export function moonSummaryHtml(isGM, serialOverride?){
  var st = ensureSettings();
  if (st.moonsEnabled === false){
    return _menuBox('\uD83C\uDF19 Moon Summary',
      '<div style="opacity:.7;">Moon system is disabled.</div>' +
      (isGM ? '<div style="margin-top:4px;font-size:.85em;">Enable: <code>!cal settings moons on</code></div>' : '')
    );
  }

  var today = isFinite(serialOverride) ? (serialOverride|0) : todaySerial();
  moonEnsureSequences(today, MOON_PREDICTION_LIMITS.highMaxDays);

  // Date already appears in the _menuBox title below; skip repeating it in the body.
  var body = '';

  var notableLines = _moonCompactStatusLines(today);
  if (notableLines.length){
    body += '<div style="font-size:.85em;line-height:1.6;">' + notableLines.join('<br>') + '</div>';
  } else {
    body += '<div style="font-size:.82em;opacity:.55;">No moons at full or new today.</div>';
  }

  body += '<div style="margin-top:6px;">' +
    button('Full View', 'moon') +
  '</div>';

  return _menuBox('\uD83C\uDF19 Moon Summary \u2014 ' + esc(formalDateLabelFromSerial(today)), body);
}

// ---------------------------------------------------------------------------
// 20j) Moon panel HTML
// ---------------------------------------------------------------------------

// GM panel. Players see the same content (no knowledge tiers in Roll20).
// Returns an array of HTML parts to send as separate messages (avoids Roll20 size limits).
export function moonPanelParts(serialOverride?){
  var st = ensureSettings();
  if (st.moonsEnabled === false){
    return [_menuBox('\uD83C\uDF19 Moons',
      '<div style="opacity:.7;">Moon system is disabled.</div>'+
      '<div style="margin-top:4px;font-size:.85em;">Enable: <code>!cal settings moons on</code></div>'
    )];
  }

  var ms  = getMoonState();
  var cal = getCal();
  var cur = cal.current;
  var today = isFinite(serialOverride) ? (serialOverride|0) : toSerial(cur.year, cur.month, cur.day_of_the_month);
  moonEnsureSequences(today, MOON_PREDICTION_LIMITS.highMaxDays);
  var dateLabel = dateLabelFromSerial(today);

  var sys = _getMoonSys();
  if (!sys){
    return [_menuBox('\uD83C\uDF19 Moons', '<div style="opacity:.7;">No moon data for this calendar system.</div>')];
  }

  var prevSer = _shiftSerialByMonth(today, -1);
  var nextSer = _shiftSerialByMonth(today, 1);
  var navRow = '<div style="margin:3px 0 6px 0;">'+
    button('Show Previous','moon on '+_serialToDateSpec(prevSer))+' '+
    button('Show Next','moon on '+_serialToDateSpec(nextSer))+
    '</div>';

  var parts = [];

  // Text list: nav + today summary + moon rows + ascendant/dim
  {
    var rows = sys.moons.map(function(moon){
      return _moonRowHtml(moon, today, 'high', MOON_PREDICTION_LIMITS.highMaxDays);
    });
    var listSections = [rows.join('')];

    // Ascendant Moons / Dim Moons (Eberron only)
    if (ensureSettings().planesEnabled !== false){
      var ascendantMoons = [];
      var dimMoons = [];
      for (var ai = 0; ai < sys.moons.length; ai++){
        var aMoon = sys.moons[ai];
        if (!aMoon.plane) continue;
        try {
          var plSt = getPlanarState(aMoon.plane, today);
          if (plSt && plSt.phase === 'coterminous') ascendantMoons.push(aMoon.name);
          else if (plSt && plSt.phase === 'remote') dimMoons.push(aMoon.name);
        } catch(ea){}
      }
      for (var ai2 = 0; ai2 < sys.moons.length; ai2++){
        var aMoon2 = sys.moons[ai2];
        if (aMoon2.associatedMonth && (cur.month + 1) === aMoon2.associatedMonth){
          if (ascendantMoons.indexOf(aMoon2.name) < 0) ascendantMoons.push(aMoon2.name);
        }
      }
      if (ascendantMoons.length){
        listSections.push('<div style="font-size:.85em;margin-top:4px;">✨ <b>Ascendant Moons:</b> ' + ascendantMoons.map(esc).join(', ') + '</div>');
      }
      if (dimMoons.length){
        listSections.push('<div style="font-size:.85em;margin-top:2px;opacity:.7;">◌ <b>Dim Moons:</b> ' + dimMoons.map(esc).join(', ') + '</div>');
      }
    }

    var calBody = navRow +
      _moonTodaySummaryHtml(today, 'high', MOON_PREDICTION_LIMITS.highMaxDays) +
      listSections.join('');
    parts.push(_menuBox('🌙 Moons — ' + esc(dateLabel), calBody));
  }

  // GM controls (separate message to stay within Roll20 size limits)
  {
    // Per-moon anchors (Night of the Eye, full/new phase shifts, reseed)
    // are web-app-only — pasted into Roll20 via `!cal token`. Roll20 only
    // exposes the toggle.
    var manageChoices = 'Toggle Moons On/Off,toggle';
    var gmControls = '<div style="margin:4px 0;">' +
      button('Management','moon manage ?{Action|' + manageChoices + '}') +
      '</div>';
    gmControls +=
      '<div style="margin-top:7px;">' + button('⬅️ Back','show') + '</div>';
    parts.push(_menuBox('🌙 GM Controls', gmControls));
  }

  return parts;
}

// Player panel -- same text list as GM, no knowledge tiers in Roll20
export function moonPlayerPanelHtml(serialOverride?){
  var st = ensureSettings();
  if (st.moonsEnabled === false){
    return _menuBox('🌙 Moons', '<div style="opacity:.7;">Moon system is not active.</div>');
  }

  var cal = getCal();
  var cur = cal.current;
  var today = isFinite(serialOverride) ? (serialOverride|0) : toSerial(cur.year, cur.month, cur.day_of_the_month);
  moonEnsureSequences(today, MOON_PREDICTION_LIMITS.highMaxDays);
  var dateLabel = dateLabelFromSerial(today);

  var sys = _getMoonSys();
  if (!sys){
    return _menuBox('🌙 Moons', '<div style="opacity:.7;">No moon data for this calendar system.</div>');
  }

  var prevSer = _shiftSerialByMonth(today, -1);
  var nextSer = _shiftSerialByMonth(today, 1);
  var navRow = '<div style="margin:3px 0 6px 0;">'+
    button('Show Previous','moon on '+_serialToDateSpec(prevSer))+' '+
    button('Show Next','moon on '+_serialToDateSpec(nextSer))+
    '</div>';

  var rows = sys.moons.map(function(moon){
    return _moonRowHtml(moon, today, 'high', MOON_PREDICTION_LIMITS.highMaxDays);
  });

  var body = navRow +
    _moonTodaySummaryHtml(today, 'high', MOON_PREDICTION_LIMITS.highMaxDays) +
    rows.join('');

  return _menuBox('🌙 Moons — ' + esc(dateLabel), body);
}

// ---------------------------------------------------------------------------
// 20j) Moon command handler  (!cal moon ...)
// ---------------------------------------------------------------------------

export function _moonParseMoonName(str, sys){
  // Case-insensitive match against moon names
  var s = str.toLowerCase();
  for (var i = 0; i < sys.moons.length; i++){
    if (sys.moons[i].name.toLowerCase() === s) return sys.moons[i].name;
  }
  return null;
}

export function _normDeg(n){
  n = n % 360;
  return (n < 0) ? (n + 360) : n;
}

export function handleMoonCommand(m, args){
  // args[0]='moon', args[1]=subcommand, args[2+]=params
  var sub = String(args[1] || '').toLowerCase();
  var st  = ensureSettings();

  // Temporary compatibility alias. Keep silent for now, then prune once
  // downstream notes/buttons stop pointing at the older branch.
  if (sub === 'phases') sub = 'summary';

  if (sub === 'summary'){
    moonEnsureSequences();
    return whisper(m.who, moonSummaryHtml(playerIsGM(m.playerid)));
  }

  // Anyone can view — Roll20 shows the same info to GM and players.
  if (!sub || sub === 'show'){
    moonEnsureSequences();
    if (playerIsGM(m.playerid)){
      return whisperParts(m.who, moonPanelParts());
    } else {
      return whisper(m.who, moonPlayerPanelHtml());
    }
  }

  // !cal moon on <dateSpec> — inspect moon states on a specific day (GM + players)
  if (sub === 'on' || sub === 'date'){
    var dateToksOn = args.slice(2).map(function(t){ return String(t||'').trim(); }).filter(Boolean);
    var prefOn = parseDatePrefixForAdd(dateToksOn);
    if (!prefOn){
      return whisper(m.who, 'Usage: <code>!cal moon on &lt;dateSpec&gt;</code> (example: <code>!cal moon on Rhaan 14 998</code>)');
    }
    var serialOn = toSerial(prefOn.year, prefOn.mHuman - 1, prefOn.day);
    moonEnsureSequences(serialOn, MOON_PREDICTION_LIMITS.highMaxDays);
    if (playerIsGM(m.playerid)){
      return whisperParts(m.who, moonPanelParts(serialOn));
    }
    return whisper(m.who, moonPlayerPanelHtml(serialOn));
  }

  // Beyond this point, GM-only management. Players fall through to usage help.
  if (!playerIsGM(m.playerid)){
    return whisper(m.who,
      'Moon: <code>!cal moon</code> &nbsp;·&nbsp; <code>!cal moon on &lt;dateSpec&gt;</code>'
    );
  }

  // Management dropdown emits `!cal moon manage <action>`; we forward to
  // the matching subcommand. Only `toggle` survives the engine swap —
  // the `reseed`, `eye`, and `reset` family relied on the wrapper's
  // pre-generated sequence buffer and GM-anchor blob, both deleted in
  // PR 2c. Anchors now flow exclusively through `!cal token`.
  if (sub === 'manage'){
    var manageAction = String(args[2] || '').toLowerCase();
    if (!manageAction){
      return whisper(m.who, 'Moon management: use the dropdown to select an action.');
    }
    return handleMoonCommand(m, ['moon', manageAction].concat(args.slice(3)));
  }

  if (sub === 'toggle'){
    st.moonsEnabled = (st.moonsEnabled === false);
    st._moonsAutoToggle = false;
    return whisperParts(m.who, moonPanelParts());
  }

  whisper(m.who,
    'Moon: <code>!cal moon</code> &nbsp;·&nbsp; ' +
    '<code>!cal moon on &lt;dateSpec&gt;</code>'
  );
}
