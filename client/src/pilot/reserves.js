// Каталог резервів, перенесений з таблиці «Резерви».
//
// Ранг визначає ціну в PR (RESERVE_RANK_PR) і кількість секцій лічильника в
// downtime-дії Get Creative. Категорія — лише для групування в магазині.
//
// Тексти лишені мовою оригіналу таблиці: частина англійською, частина українською.

export const RESERVE_CATEGORIES = [
  { key: 'mech', label: 'МЕХ РЕЗЕРВИ' },
  { key: 'tactical', label: 'ТАКТИЧНІ РЕЗЕРВИ' },
  { key: 'pilot', label: 'РЕЗЕРВИ ДЛЯ ПІЛОТА' },
  { key: 'resource', label: 'РЕСУРС РЕЗЕРВИ' },
];

// Ціна за рангом.
export const RESERVE_RANK_PR = { 1: 10, 2: 20, 3: 40 };

// Без downtime-дії можна купити лише мех-резерв і лише один. Усе інше — інші категорії
// або друга покупка — потребує дії.
export const RESERVE_FREE_BUY_CATEGORY = 'mech';
export const RESERVE_FREE_BUY_MAX = 1;

// Чи можна взяти цей резерв без дії, за наявного залишку безкоштовних покупок.
export function reserveIsFreeBuy(def, freeUsed) {
  if (!def) return false;
  return def.category === RESERVE_FREE_BUY_CATEGORY && freeUsed < RESERVE_FREE_BUY_MAX;
}

// Резерви з переліку «Адаптовані запчастини»: з цим покращенням ангару вони живуть
// не одну гру, а дві (рівень 1) чи три (рівень 2).
export const ADAPTED_PARTS_KEYS = [
  'oba-liquidmetal-cloak',
  'up-armoring',
  'leg-enhancements',
  'weathering',
  'rented-gear',
  'boosted-servos',
];

// Скільки ігор проживе куплений резерв. Звичайний згорає після місії; резерв із
// переліку «Адаптованих запчастин» — довше, залежно від рівня покращення.
export function reserveGamesLeft(key, hangarOwned) {
  const parts = (hangarOwned || {}).parts || 0;
  if (parts > 0 && ADAPTED_PARTS_KEYS.includes(key)) return 1 + parts;
  return 1;
}

export const RESERVES = [
  {
    key: 'gyro-stabilizers',
    name: 'Gyro Stabilizers',
    rank: 1,
    category: 'mech',
    desc: '1/mission: As a protocol, treat all of your weapons as if they aren\'t ORDNANCE for the rest of the turn.',
  },
  {
    key: 'explosive-knuckles',
    name: 'Explosive Knuckles',
    rank: 1,
    category: 'mech',
    desc: '1/mission: After hitting with a RAM, you may activate this to deal 6 explosive damage.',
  },
  {
    key: 'deployable-shield',
    name: 'Deployable Shield',
    rank: 1,
    category: 'mech',
    desc: 'A single-use deployable shield generator – a SIZE 1 deployable that grants soft cover to all friendly characters in a BURST 2 radius.',
  },
  {
    key: 'personal-cloak',
    name: 'Personal Cloak',
    rank: 1,
    category: 'mech',
    desc: '1/mission: As a protocol, you become INVISIBLE until the start of your next turn.',
  },
  {
    key: 'precision-targeting-software',
    name: 'Precision Targeting Software',
    rank: 1,
    category: 'mech',
    desc: '1/mission: After hitting with an attack, you may activate this to make the attack critical.',
  },
  {
    key: 'redundant-repair',
    name: 'Redundant repair',
    rank: 1,
    category: 'mech',
    desc: 'The ability to STABILIZE as a free action once per mission.',
  },
  {
    key: 'retractable-slab-shields',
    name: 'Retractable Slab Shields',
    rank: 1,
    category: 'mech',
    desc: '1/mission: As a protocol, you become IMMOBILIZED until the start of your next turn and gain RESISTANCE to all damage for the same duration.',
  },
  {
    key: 'run-off-energy-converter',
    name: 'Run-Off Energy Converter',
    rank: 1,
    category: 'mech',
    desc: '1/mission: When you use your CORE POWER, you may activate this to generate a BURST 4 aura of lightning. Hostile characters in the area take 4 energy damage.',
  },
  {
    key: 'aganju-tower',
    name: 'Aganju Tower',
    rank: 1,
    category: 'mech',
    desc: 'After being hit by a ranged or melee attack you may choose to reduce the damage to 0. Upon use, this piece of gear is destroyed.',
  },
  {
    key: 'emergency-coolant-reservoir',
    name: 'Emergency Coolant Reservoir',
    rank: 1,
    category: 'mech',
    desc: '1/mission: Clear EXPOSED as a free action.',
  },
  {
    key: 'high-speed-loader',
    name: 'High-Speed Loader',
    rank: 1,
    category: 'mech',
    desc: '1/mission: Reload all weapons as a free action.',
  },
  {
    key: 'boosted-servos',
    name: 'Boosted servos',
    rank: 1,
    category: 'mech',
    desc: 'IMMUNITY to the SLOWED condition.',
  },
  {
    key: 'frostfang-servos',
    name: 'Frostfang Servos',
    rank: 1,
    category: 'mech',
    desc: '1/mission: BOOST as a free action.',
  },
  {
    key: 'bubble-active-personal-shield',
    name: '"Bubble" Active Personal Shield',
    rank: 1,
    category: 'mech',
    desc: '1/mission: As a protocol, gain 4+GRIT OVERSHIELD.',
  },
  {
    key: 'crash-cushions',
    name: 'Crash Cushions',
    rank: 1,
    category: 'mech',
    desc: '1/mission: When you become STUNNED, you may activate this to not become STUNNED.',
  },
  {
    key: 'hot-load-ammunition',
    name: 'Hot-Load Ammunition',
    rank: 1,
    category: 'tactical',
    desc: 'You can spend this reserve to empower your weapons. The next successful ranged or melee attack you make can\'t have its damage reduced in any way, and the target must pass a Hull save or be knocked Prone. This effect ends when you hit with a ranged or melee attack roll, or at the end of the scene.',
  },
  {
    key: 'recon-drone',
    name: 'Recon Drone',
    rank: 1,
    category: 'tactical',
    desc: 'At the start of each combat, choose a single hostile character within Range 50 and Scan them. This does not require line of sight.',
  },
  {
    key: 'environmental-shielding',
    name: 'Environmental Shielding',
    rank: 1,
    category: 'tactical',
    desc: 'Equipment that allows you to ignore a particular battlefield hazard or dangerous terrain, such as extreme heat or cold.',
  },
  {
    key: 'incendiary-ammo-pilot-scale',
    name: 'Incendiary Ammo (Pilot-Scale)',
    rank: 1,
    category: 'pilot',
    desc: 'Changes a pilot-scale weapon\'s damage type to BURN.',
  },
  {
    key: 'devastator-grenades',
    name: 'Devastator Grenades',
    rank: 1,
    category: 'pilot',
    desc: 'Your Frag Grenades deal +2 damage.',
  },
  {
    key: 'pneumatic-enhancer',
    name: 'Pneumatic Enhancer',
    rank: 1,
    category: 'pilot',
    desc: 'Your pilot-scale HEAVY A/C weapons gain the following: On hit: target is knocked PRONE.',
  },
  {
    key: 'sniper-scope',
    name: 'Sniper Scope',
    rank: 1,
    category: 'pilot',
    desc: 'Your pilot-scale signature weapons gain +5 RANGE.',
  },
  {
    key: 'junker-exo-rig',
    name: 'Junker Exo-Rig',
    rank: 1,
    category: 'pilot',
    desc: 'You gain +1 ACCURACY to JOCKEY.',
  },
  {
    key: 'military-grade-jetpack',
    name: 'Military-Grade Jetpack',
    rank: 1,
    category: 'pilot',
    desc: 'Can be attached to any hardsuit, allowing the wearer to fly when they move or BOOST.',
  },
  {
    key: 'extended-harness',
    name: 'Extended Harness',
    rank: 1,
    category: 'pilot',
    desc: 'A custom harness that allows you to carry an extra pilot weapon and two extra pieces of pilot gear for the duration of this mission.',
  },
  {
    key: 'supplies',
    name: 'Supplies',
    rank: 1,
    category: 'resource',
    desc: 'Gear allowing easy crossing of a hazardous or hostile area.',
  },
  {
    key: 'access',
    name: 'Access',
    rank: 1,
    category: 'resource',
    desc: 'A keycard, invite, bribes or insider access to a particular location.',
  },
  {
    key: 'disguise',
    name: 'Disguise',
    rank: 1,
    category: 'resource',
    desc: 'An effective disguise or cover identity, allowing uncontested access to a location.',
  },
  {
    key: 'diversion',
    name: 'Diversion',
    rank: 1,
    category: 'resource',
    desc: 'A distraction that provides time to take action without fear of consequence.',
  },
  {
    key: 'knowledge',
    name: 'Knowledge',
    rank: 1,
    category: 'resource',
    desc: 'An understanding of local history, customs, culture, or etiquette.',
  },
  {
    key: 'tracking',
    name: 'Tracking',
    rank: 1,
    category: 'resource',
    desc: 'Details on the location of important objects or people.',
  },
  {
    key: 'blackmail',
    name: 'Blackmail',
    rank: 1,
    category: 'resource',
    desc: 'Blackmail materials or sensitive information concerning a particular person.',
  },
  {
    key: 'safe-harbor',
    name: 'Safe Harbor',
    rank: 1,
    category: 'resource',
    desc: 'Guaranteed safety for meeting, planning, or recuperating.',
  },
  {
    key: 'automated-reflex-suite',
    name: 'Automated Reflex Suite',
    rank: 2,
    category: 'mech',
    desc: '1/mission: When you are hit by an attack, you may make the attack a miss as a reaction.',
  },
  {
    key: 'ic-blinkpack',
    name: 'IC Blinkpack',
    rank: 2,
    category: 'mech',
    desc: '1/mission: As a protocol, you may teleport whenever you move for the rest of your turn.',
  },
  {
    key: 'hyper-spec-fuel-canister',
    name: 'Hyper-Spec Fuel Canister',
    rank: 2,
    category: 'mech',
    desc: '1/mission: As a protocol, you may activate this to gain +1 ACCURACY on all attacks, saves, and checks until the start of your next turn.',
  },
  {
    key: 'lookingglass-overlay',
    name: 'LOOKINGGLASS Overlay',
    rank: 2,
    category: 'mech',
    desc: 'You can spend this reserve during any combat to activate the sensors. For the rest of the scene you ignore soft cover and ignore Invisible for characters within Range 3. Hostile characters within Range 3 can\'t become Hidden, though they remain Hidden if they were already.',
  },
  {
    key: 'weathering',
    name: 'Weathering',
    rank: 2,
    category: 'mech',
    desc: 'Spend this reserve to grant your mech IMMUNITY to difficult terrain and SLOWED for the next mission.',
  },
  {
    key: 'compulsory-scope-upgrade',
    name: 'Compulsory Scope Upgrade',
    rank: 2,
    category: 'mech',
    desc: 'At the start of combat you may choose to activate this gear. Any time you miss on a ranged attack, you gain +1 Accuracy on your next ranged attack roll made in the same turn. Upon use, this piece of gear is destroyed.',
  },
  {
    key: 'smart-ammo',
    name: 'Smart ammo',
    rank: 2,
    category: 'mech',
    desc: 'All weapons of your choice can be fired as if they are SMART.',
  },
  {
    key: 'jump-jets',
    name: 'Jump jets',
    rank: 2,
    category: 'mech',
    desc: 'During this mission your mech can FLY when moving, but must end movement on land.',
  },
  {
    key: 'rented-gear',
    name: 'Rented gear',
    rank: 2,
    category: 'mech',
    desc: 'Дозволяє отримати зброю, моди та системи з інших ліцензій чи екзотичне на поточну місію.',
  },
  {
    key: 'bombardment',
    name: 'Bombardment',
    rank: 2,
    category: 'tactical',
    desc: 'The ability to call in artillery or orbital bombardment once during mech combat (full action, RANGE 30 within line of sight, BLAST 2, 3d6 explosive damage).',
  },
  {
    key: 'sniper-team',
    name: 'Sniper Team',
    rank: 2,
    category: 'tactical',
    desc: 'You can spend this reserve at the start of any combat to call upon a nearby sniper team to provide you with fire support. For the rest of the scene, each time you take the Lock On Quick Tech action, your target takes 2 AP kinetic damage.',
  },
  {
    key: 'ambush',
    name: 'Ambush',
    rank: 2,
    category: 'tactical',
    desc: 'Intel that allows you to choose exactly where your next battle will take place, including the layout of terrain and cover.',
  },
  {
    key: 'high-mobility-pack',
    name: 'High-Mobility Pack',
    rank: 3,
    category: 'mech',
    desc: 'You can spend this reserve at the start of any combat to count any and all of your movement as flying for the rest of that scene. Additionally, you may deploy yourself anywhere on the map after all other characters (PCs and NPCs) have deployed.',
  },
  {
    key: 'oba-liquidmetal-cloak',
    name: 'Oba Liquidmetal Cloak',
    rank: 3,
    category: 'mech',
    desc: 'This mech-scale cloak gives your mech +2 Evasion until this gear is destroyed. Upon taking structure damage, this piece of gear is destroyed.',
  },
  {
    key: 'field-marshal-comp-con',
    name: '"Field Marshal" Comp/Con',
    rank: 3,
    category: 'mech',
    desc: '1/mission: As a quick action, up to two allied characters within SENSORS may each immediately perform a single quick action as a reaction.',
  },
  {
    key: 'up-armoring',
    name: 'Up-Armoring',
    rank: 3,
    category: 'mech',
    desc: 'Your mech gains +1 Armor for the duration of the next mission (to a maximum of 4), and you start the next combat with +5 Overshield.',
  },
  {
    key: 'esu-s-eyes-ocular-apparatus',
    name: 'Esu\'s Eyes Ocular Apparatus',
    rank: 3,
    category: 'mech',
    desc: 'At the start of combat you may choose to activate this gear, allowing you to ignore hostile characters\' Hidden and Invisible statuses for the duration of the combat. Upon use, this piece of gear is destroyed.',
  },
  {
    key: 'leg-enhancements',
    name: 'Leg Enhancements',
    rank: 3,
    category: 'mech',
    desc: 'Your mech ignores difficult terrain for the duration of the upcoming mission. Additionally, once during the mission you can spend this reserve to ignore Slowed or Immobilized received from a hostile source, negating the condition as it happens.',
  },
  {
    key: 'high-caliber-ammo',
    name: 'High Caliber Ammo',
    rank: 3,
    category: 'tactical',
    desc: 'Spend this reserve at the start of any combat scene to give all your weapons AP until the end of the scene.',
  },
  {
    key: 'reinforcements',
    name: 'Reinforcements',
    rank: 3,
    category: 'tactical',
    desc: 'The ability to call in a friendly NPC mech of any Tier, once per mission.',
  },
  {
    key: 'nhp-assistant',
    name: 'NHP Assistant',
    rank: 3,
    category: 'tactical',
    desc: 'A non-human person (NHP) – an advanced artificial intelligence – controlled by the GM, that can give you advice on the current situation.',
  },
  {
    key: 'orbital-drop',
    name: 'Orbital Drop',
    rank: 3,
    category: 'tactical',
    desc: 'The ability to start the mission by dropping from orbit into a heavily fortified or hard to reach location.',
  },
  {
    key: 'vehicle',
    name: 'Vehicle',
    rank: 3,
    category: 'tactical',
    desc: 'Use of a transport vehicle or starship (e.g. a TIER 1 NPC with the VEHICLE or SHIP template.)',
  },
];

export function reserveByKey(key) {
  return RESERVES.find((r) => r.key === key) || null;
}
