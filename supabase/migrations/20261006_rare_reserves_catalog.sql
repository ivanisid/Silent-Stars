-- Каталог рідкісних резервів переїжджає з коду (client/src/pilot/rareReserves.js) у базу,
-- щоб ГМ міг редагувати й додавати резерви та вішати на них теги — передусім теги
-- фракцій: доступ до резерву належить фракції, і перед грою зручно відфільтрувати те,
-- що можна взяти від цього замовника.
--
-- Теги лише для фільтрування — додаток нічого не забороняє, хто що може взяти,
-- домовлено за столом.
--
-- Видалення резерву — це приховування (archived): пілоти тримають резерви за key
-- у state.vault / state.reserves, і назва має знаходитись навіть для прихованого.
--
-- Писати можна лише через gm_* функції (перевірка private.is_gm()), читати — усім
-- залогіненим.
--
-- key наявних резервів збережено (r1-01 … r2-NN): на них уже посилаються стани пілотів.
-- Колонка traits — колишнє поле tags каталогу («Limited 1», «1/round»…), перейменоване,
-- щоб не плутати з тегами-мітками.
--
-- Rollback:
--   drop function public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[]);
--   drop function public.gm_set_rare_reserve_archived(text, boolean);
--   drop function public.gm_save_reserve_tag(uuid, text, text);
--   drop function public.gm_delete_reserve_tag(uuid);
--   drop table public.rare_reserve_tags, public.rare_reserves, public.reserve_tags;
--   і повернути статичний каталог у rareReserves.js.

create table if not exists public.reserve_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  kind text not null default 'faction' check (kind in ('faction', 'other')),
  created_at timestamptz not null default now()
);
create unique index if not exists reserve_tags_name_key on public.reserve_tags (lower(btrim(name)));

create table if not exists public.rare_reserves (
  key text primary key default ('rc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  rank integer not null check (rank in (1, 2)),
  name text not null check (btrim(name) <> ''),
  action text not null default '',
  traits text not null default '',
  description text not null default '',
  flavor text not null default '',
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rare_reserve_tags (
  reserve_key text not null references public.rare_reserves (key) on delete cascade,
  tag_id uuid not null references public.reserve_tags (id) on delete cascade,
  primary key (reserve_key, tag_id)
);
create index if not exists rare_reserve_tags_tag_idx on public.rare_reserve_tags (tag_id);

alter table public.reserve_tags enable row level security;
alter table public.rare_reserves enable row level security;
alter table public.rare_reserve_tags enable row level security;

drop policy if exists "reserve tags: read" on public.reserve_tags;
create policy "reserve tags: read" on public.reserve_tags for select to authenticated using (true);
drop policy if exists "rare reserves: read" on public.rare_reserves;
create policy "rare reserves: read" on public.rare_reserves for select to authenticated using (true);
drop policy if exists "rare reserve tags: read" on public.rare_reserve_tags;
create policy "rare reserve tags: read" on public.rare_reserve_tags for select to authenticated using (true);

-- Створити (p_key null) або оновити резерв разом із повним набором тегів — однією
-- транзакцією, щоб резерв не лишився з половиною тегів.
create or replace function public.gm_save_rare_reserve(
  p_key text,
  p_rank integer,
  p_name text,
  p_action text,
  p_traits text,
  p_description text,
  p_flavor text,
  p_tag_ids uuid[]
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
begin
  if not private.is_gm() then raise exception 'Редагувати резерви може лише ГМ.'; end if;
  if p_rank not in (1, 2) then raise exception 'Ранг рідкісного резерву — 1 або 2.'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Вкажіть назву резерву.'; end if;

  if p_key is null then
    insert into rare_reserves (rank, name, action, traits, description, flavor, sort)
    values (
      p_rank, btrim(p_name), coalesce(btrim(p_action), ''), coalesce(btrim(p_traits), ''),
      coalesce(btrim(p_description), ''), coalesce(btrim(p_flavor), ''),
      (select coalesce(max(sort), 0) + 1 from rare_reserves)
    )
    returning key into v_key;
  else
    update rare_reserves set
      rank = p_rank,
      name = btrim(p_name),
      action = coalesce(btrim(p_action), ''),
      traits = coalesce(btrim(p_traits), ''),
      description = coalesce(btrim(p_description), ''),
      flavor = coalesce(btrim(p_flavor), ''),
      updated_at = now()
    where key = p_key
    returning key into v_key;
    if v_key is null then raise exception 'Резерв не знайдено.'; end if;
  end if;

  delete from rare_reserve_tags where reserve_key = v_key;
  insert into rare_reserve_tags (reserve_key, tag_id)
  select v_key, t.id from reserve_tags t where t.id = any (coalesce(p_tag_ids, '{}'));

  return v_key;
end;
$function$;

create or replace function public.gm_set_rare_reserve_archived(p_key text, p_archived boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Редагувати резерви може лише ГМ.'; end if;
  update rare_reserves set archived = p_archived, updated_at = now() where key = p_key;
  if not found then raise exception 'Резерв не знайдено.'; end if;
end;
$function$;

-- Створити (p_id null) або перейменувати тег / змінити його тип.
create or replace function public.gm_save_reserve_tag(p_id uuid, p_name text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not private.is_gm() then raise exception 'Керувати тегами може лише ГМ.'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Вкажіть назву тегу.'; end if;
  if p_kind not in ('faction', 'other') then raise exception 'Невідомий тип тегу: %', p_kind; end if;

  if exists (
    select 1 from reserve_tags
    where lower(btrim(name)) = lower(btrim(p_name)) and (p_id is null or id <> p_id)
  ) then
    raise exception 'Тег «%» уже є.', btrim(p_name);
  end if;

  if p_id is null then
    insert into reserve_tags (name, kind) values (btrim(p_name), p_kind) returning id into v_id;
  else
    update reserve_tags set name = btrim(p_name), kind = p_kind where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Тег не знайдено.'; end if;
  end if;
  return v_id;
end;
$function$;

-- Тег знімається з усіх резервів (on delete cascade), самі резерви лишаються.
create or replace function public.gm_delete_reserve_tag(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Керувати тегами може лише ГМ.'; end if;
  delete from reserve_tags where id = p_id;
  if not found then raise exception 'Тег не знайдено.'; end if;
end;
$function$;

revoke execute on function public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[]) from public, anon;
revoke execute on function public.gm_set_rare_reserve_archived(text, boolean) from public, anon;
revoke execute on function public.gm_save_reserve_tag(uuid, text, text) from public, anon;
revoke execute on function public.gm_delete_reserve_tag(uuid) from public, anon;
grant execute on function public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.gm_set_rare_reserve_archived(text, boolean) to authenticated;
grant execute on function public.gm_save_reserve_tag(uuid, text, text) to authenticated;
grant execute on function public.gm_delete_reserve_tag(uuid) to authenticated;

-- Початковий каталог — дослівно з rareReserves.js. on conflict do nothing: повторний
-- запуск не затирає правок ГМа.
insert into public.rare_reserves (key, rank, name, action, traits, description, flavor, sort) values
  ('r1-01', 1, 'SNAP HOOKS', 'Quick Action', 'Limited 1', 'Automatically grapple an adjacent target.', 'Cabled hooks launched from exterior-mounted ejection points for rapid, intimate engagement.', 1),
  ('r1-02', 1, 'MOLECULAR WHETSTONE', 'Free Action', '1/round, Limited 1', 'After you successfully hit with a melee attack, but before damage is rolled, spend this reserve as a free action to cause the target to become Shredded until the end of the current turn.', 'A device installed in a weapon''s grip that sends an autophagic pulse up the blade, sharpening it before impact.', 2),
  ('r1-03', 1, 'KINETIC PULSE COIL', 'Quick Action', 'Limited 1', 'Ram every character in Burst 1.', 'Chassis-mounted woofers. Kinetic-absorbant coils gather latent energy from normal actions, such as walking, running, or fighting, until released with explosive force.', 3),
  ('r1-04', 1, '"ICARUS" MULTISTAGE BOOSTER', 'Free Action', 'Limited 1', 'When you make a standard move, spend this reserve as a free action to move your speed in a straight line.', 'Dual break-away boosters that help close the distance; or increase it, as needed.', 4),
  ('r1-05', 1, 'REDUNDANT CLADDING', 'Reaction', 'Limited 1', 'Trigger: You''re successfully hit by an attack. Effect: You gain resistance to that attack, but are impaired until the end of your next turn.', 'Rough, but effective, armor plating that can take hits your normal armor might find disagreeable. Won''t protect you from cockpit whiplash as a result of said impacts.', 5),
  ('r1-06', 1, 'CONCUSSIVE BRACER', 'Free Action', 'Limited 2', 'When you successfully hit with a Ram, spend this reserve as a free action to give the target Impaired until the end of their next turn.', 'An external-fit gauntlet of extraordinary weight. The stored concussive energy is expended almost as quickly as its victims fall to the ground.', 6),
  ('r1-07', 1, '"CUIRASS" SHIELD GENERATOR', 'Quick Action', '1/round, Deployable, Shield, Limited 2', '1/round, Deploy a Cuirass Shield Generator in a free adjacent space. Creates a Burst 1 energy field upon deployment. The next 3 attacks that target any character or object within this shield treat each target as having hard cover. (Cuirass Shield Generator: Size: 1, HP 10, Evasion: 5)', 'An emitter dish mounted on a rudimentary tripod. Its power supply is limited, but consistent enough to see frequent use in the field as a quick means of fortifying positions.', 7),
  ('r1-08', 1, 'БЕЗ НАЗВИ (ID 8)', 'Quick Action', 'Limited 1', 'Reload any Loading weapon.', 'Bullet go in, bullet go out.', 8),
  ('r1-09', 1, 'CONCUSSIVE BRACER (ID 9)', 'Quick Action', 'Limited 1', 'You or an allied character within Range 3 immediately clears all Burn.', 'Sometimes a high tech problem needs a low tech solution.', 9),
  ('r1-10', 1, 'ADAPTIVE ROUNDS', 'Protocol', 'Limited 5', 'Change the damage type of your next ranged attack to either Kinetic, Energy, or Explosive.', 'Each shell casing is helpfully color coded to prevent accidental incineration in volatile environments.', 10),
  ('r1-11', 1, 'OVERPOWERED COILS', 'Reaction', 'Limited 1', 'Trigger: Your attack deals bonus damage of any kind. Effect: The target is knocked back spaces equal to the bonus damage dealt.', 'A cartridge mounted in convenient thumb reach for quick activation, bolstering the efficacy of existing weapon modifications. Burns out quick, so pick your moment.', 11),
  ('r1-12', 1, 'REACTIVE SHUNT', 'Free Action', 'Limited 1', 'When you brace, automatically clear all heat as a free action. All characters adjacent to you take heat equal to half of what you cleared.', 'An emergency vent built to disseminate excess reactor waste as quickly as possible. Make your choices everyone else''s problem.', 12),
  ('r1-13', 1, '"THUMB" CANNON', 'Protocol', 'Limited 2', 'You may Ram from up to range 5 until the end of this turn.', 'Arm-mounted, bulky, and thunderous, pilots are recommended to wear ear plugs before they charge it up.', 13),
  ('r1-14', 1, 'FUEL RESERVES', 'Protocol', 'Limited 2', 'All movement actions (standard move, Boost, etc.) you take this round may move 1 additional space.', 'Keep a little extra in the tank.', 14),
  ('r1-15', 1, 'ACHILLES ROUND', 'Passive', 'Limited 3', 'When you reload any weapon, that weapon''s next attack gains the Overkill tag.', 'Someone carved a skull and crossbones into the shell casing.', 15),
  ('r1-16', 1, 'DEMO CHARGE', 'Quick Action', 'Limited 1', 'Immediately deal 40 Kinetic damage to an adjacent object or piece of terrain.', 'Clear the view.', 16),
  ('r1-17', 1, 'EXPENDABLE RIFLING', 'Protocol', 'Limited 3', 'Your next ranged attack has its Range extended by 5.', 'A long barrel that screws to the end of your gun. Designed to fit all standard GMS munitions.', 17),
  ('r1-18', 1, 'MASS-ECHO CHARGE', 'Passive', 'Limited 1', 'Whenever you successfully hit with a tech attack, roll 1D20. On a natural 20, the target is stunned after the attack resolves. This reserve persists until triggered.', 'A small, silvery chip installed in your mech''s computer core. Contains enough malicious paracode to shut down a city block, so it can only be used in short bursts.', 18),
  ('r1-19', 1, 'SUPERMUNITIONS', 'Protocol', 'Limited 1', 'Your next ranged attack that isn''t a Cone, Line, or Burst gains Blast 1, in addition to its normal profile. If it''s already Blast 1, it becomes Blast 2, and so on.', 'Volatile, modular charges that multiply the tactical and geographic scope of all standard munitions.', 19),
  ('r1-20', 1, 'SILHOUETTE SCRAMBLERS', 'Protocol', 'Limited 3', 'Attacks originating from further than Range 3 treat you as having hard cover until the end of your next turn.', 'A cyber warfare suite that scatters and distorts your image on all visual wavelengths. You''ll be less of a target and more of a cubist suggestion.', 20),
  ('r1-21', 1, 'AUTO-FLECHETTES', 'Reaction', 'Limited 1', 'Trigger: You successfully hit an Immobilized character with an attack. Effect: Deal 1D6 bonus damage.', 'Shoulder-mounted launchers that fire screaming bands of iron at speeds too slow to rely on in the heat of combat, but the trapped prey can do nothing but watch.', 21),
  ('r1-22', 1, 'ICE OUT DEMO DISC', 'Quick Action', 'Limited 2', 'Spend this reserve to gain Immunity to all tech actions until the start of your next turn.', 'Comes free in the mail with a subscription to any one of a number of exciting Smith Shimano services.', 22),
  ('r1-23', 1, 'SPIDER TRAP', 'Quick Action', 'Deployable, Limited 3', 'Deploy an electrified mesh that encompasses a free Blast 1 area within Range 5. Characters who start their turn in the Spider Trap or who enter it for the first time in a round must make an Engineering save or become Immobilized.', 'Your parlor is the effective combat theater of the current engagement and the fly is a six ton somersaulting war robot with a nuclear reactor, but the principle isn''t too far off.', 23),
  ('r1-24', 1, 'SERVO LIMITER BYPASS', 'Free Action', '1/round, Limited 3', '1/round, When you successfully hit with a melee attack, spend this reserve as a free action to deal 3 Knockback, in addition to any other knockback effects. After the attack is resolved, roll 1D6; on a 5+, your mech is Impaired until the end of your next turn.', 'This handy plug-n-play override lets you get around the factory-standard failsafes native to the original printing.', 24),
  ('r1-25', 1, 'FREQUENCY ALIGNMENT NODE', 'Quick Action', 'Limited 2', 'Clear the Jammed condition and gain immunity to Jammed until the end of your next turn.', 'Ancillary nodes connected to your sensor array that broadcast constantly shifting, synchronistic frequencies. Trick hostile jamming technology into following a ghost of your mech down a dark alley.', 25),
  ('r1-26', 1, 'EMERGENCY HEAT TRAP', 'Reaction, Quick Action', 'Limited 1', 'The next time you would gain Heat from a hostile source, spend this reserve as a reaction to reduce the amount to 0 and gain a Shunt Charge. The Firecracker Charge lasts until used, but expires at the end of the scene. As a quick action on any of your turns, you may lob the Firecracker Charge at a hostile enemy character within Range 5. They must pass an Agility save or take energy damage equal to the Heat that you would have gained by the triggering effect.', 'Yeah, pretty handy. They say some merc invented these in his garage with a box of spare parts ''cause his team kept melting their reactors.', 26),
  ('r1-27', 1, 'KNOCKOUT CHARGE', 'Reaction', 'Limited 3', 'Trigger: Critically Hit with a ranged or melee weapon. Effect: The target of your attack is knocked Prone and becomes Slowed until the end of their next turn.', 'An impact-sensitive charge applied to blade, hammerhead, or bullet. Anyone hit with this is gonna need a minute.', 27),
  ('r1-28', 1, 'ACTIVE CAMO', 'Quick Action', 'Limited 1', 'Become Invisible until the start of your next turn.', 'An emitter device installed right about where your mech''s sternum would be. The energy pattern it projects bends the light around you, but the odd, blurry defect can clue the perceptive marksman as to where you might be skulking.', 28),
  ('r1-29', 1, 'HOLO DECOY', 'Quick Action', '1/round, Limited 3', '1/round, Create a holographic decoy of yourself. This decoy moves your Speed in a straight line from your current position; it is unaffected by difficult terrain but is stopped by obstructions and characters in its path. Hostile characters who start their turn within line of sight and range of the hologram must first make a System save or be forced to attack the decoy. The decoy shares your size, can benefit from cover, and has Evasion 10, E-Defense 10, and 1 HP. It disappears if it takes heat or damage, or at the end of your next turn. If you create a second decoy, the previous one disappears.', 'The decoy can be programmed to execute any number of gestures from a vast library of "emotes." Sure to infuriate any and all hostiles from Core to Shore.', 29),
  ('r1-30', 1, 'PUNISHER SYLO', 'Free Action', '1/round, Limited 3', '1/round When you critically hit with any attack, deal 3 Explosive damage to a different target within Range 15 as a free action.', 'A quick-launch tube armed with three fire-and-forget rockets.', 30),
  ('r1-31', 1, 'BODY FLICKER DRIVE', 'Protocol', 'Limited 3', 'Teleport whenever you Boost until the end of the current turn.', 'An experimental drive plugged right into your reactor. Painfully cold to the touch, so make sure to wear the special protective gloves it came with during installation.', 31),
  ('r1-32', 1, 'PREDATOR/PREY PING', 'Quick Action', 'Limited 2', 'Remove Hidden and Invisible from one hostile character in Sensors and line of sight. That character cannot regain either Hidden or Invisible until the end of their next turn.', 'A chunky power modulator that interfaces directly with your sensor array. Enhances the effective precision of your sensors in quick, powerful bursts, but continuous use will blow them out like a bad fuse.', 32),
  ('r1-33', 1, 'JAEGER SHOCKS', 'Free Action', '1/round, Limited 2', '1/round, If your standard move or Boost ends next to hard cover equal to or greater than your mech''s Size, spend this reserve to immediately move 2 spaces in any direction.', 'Kinetic-absorbant shocks installed in the ankle, knee, and hip joints of your mech. Allows even a multi-ton machine to quickly navigate through tight urban corridors without fear of toppling the whole block.', 33),
  ('r1-34', 1, 'SHINE-CLASS ENERGY SHIELD', 'Free Action', 'Limited 1', 'When you''re successfully hit by a ranged or melee attack, spend this reserve to gain Overshield equal to your Grit+3 before damage is rolled. These Overshield disappears after the attack is resolved.', 'An energy shield that quickly snaps into place at the instant of violent impact. Popularized by a merc pilot by the name of McCloud, infamous for his quick reflexes and fancy footwork.', 34),
  ('r1-35', 1, 'LIVING PARTICULATE NEXUS', 'Quick Action', '1/round, Limited 1', '1/round, Spend this reserve as a quick action to release a Burst 1 cloud of nanites that lasts until the start of your next turn. Hostile characters who end their turn in this cloud, or who enter it for the first time in a round, take 2AP kinetic damage.', 'Mmmm... no, I''m pretty sure it''s just gray-wash.', 35),
  ('r1-36', 1, '"CASTLE" TECH SUITE', 'Quick Action', 'Limited 1', 'Spend this reserve as a quick action. Gain a +3 bonus to System saves, a +3 bonus to your e-defense, and a +3 bonus to tech attacks. This effect lasts until the end of your next turn.', 'An advanced firewall program that drastically increases your computer''s combat efficacy.', 36),
  ('r1-37', 1, 'SAAS-CQB-TDDS', 'Free Action', 'Limited 1', 'After you hit with Overwatch, spend this reserve to immediately Overwatch against a different character in range with the same weapon. You cannot attack the same character twice.', 'A modification to your sensors that populates your HUD with predictive-analysis targets before you even see them.', 37),
  ('r1-38', 1, 'ANAGUMA-CLASS SUBALTERN', 'Quick Action', 'Drone, Limited 1', 'Spend this reserve to deploy a Anaguma combat subaltern within Sensors and line of sight. Whenever you successfully attack, the Anaguma deals 3 Energy damage to the same target as long as it''s within Range 5 of the target when the attack hits. When the Anaguma is destroyed, it detonates in a Burst 2 explosion. Characters caught in the explosion must make an Agility save or take 1D6+2 Explosive damage. They take half of that on success. The Anaguma cannot be recalled, but it can be moved with talents and abilities. It expires at the end of the scene. (Anaguma-Class Subaltern: Size: 1/2, HP 10, Evasion: 5)', 'It''s programmed with a friendly, cheerful persona package that nevertheless comes off as disturbingly enthusiastic about its own imminent self-destruction.', 38),
  ('r1-39', 1, 'AIM COMPENSATOR', 'Reaction', 'Limited 1', 'Trigger: You miss with any ranged or melee attack. Effect: Deal 2 Reliable damage.', 'A hydraulic brace installed at your mech''s shoulder and elbow that corrects your aim in the heat of combat.', 39),
  ('r1-40', 1, 'TROJAN REBOUND', 'Reaction', 'Limited 2', 'Trigger: A hostile character within Range 10 is Slowed. Effect: That character is now Immobilized for the same duration as the triggering effect.', 'A hungry, aggressive paracode that tugs on the leash it''s been given.', 40),
  ('r1-41', 1, 'SUBSPACE FIRING CHAMBER', 'Free Action', '1/round, Limited 3', '1/round, spend this reserve as a free action during any character’s turn to deal 1 damage to any character on the map regardless of range or line of sight. This damage cannot be reduced in any way.', 'It looks like a typical sidearm, except it has no muzzle; only a sheer, flat surface where bullets ought to exit. Looking at the gun too long after firing it might give some pilots motion sickness.', 41),
  ('r1-42', 1, 'SONIC EMITTER', 'Quick Action', 'Limited 1', 'Spend this reserve as a quick action to detonate a Size 1 object or piece of hard cover within Range 10 and line of sight. Characters within Burst 1 of the detonation must make an Agility save or take 1D6 explosive damage and 2 Burn. On success, they take no explosive damage and 1 Burn.', 'A dish made out of a series of concentric, hollow rings. Tension can be adjusted for concentrated frequencies.', 42),
  ('r1-43', 1, 'DETRITUS LAUNCHER', 'Quick Action', 'Limited 1', 'Launch a cloud of obstructive micro-debris in Cone 7. This zone counts as difficult terrain and soft cover until the end of the current round. Characters who start their turn in this cloud or enter it for the first time in the round become Impaired.', 'A rattling, makeshift hunk of iron with a design philosophy closer to Queen Victoria than John Creighton Harrison.', 43),
  ('r1-44', 1, 'THERMAL TRANSFER CHAMBER', 'Quick Action', 'Limited 2', '1/round, spend this reserve as a quick action to add bonus energy damage equal to your current Burn to your next successful attack.', 'A weapon mod that looks a bit like an old water radiator. It gathers energy from ambient local temperature.', 44),
  ('r1-45', 1, 'EMERGENCY BACKUP MINE', 'Free Action', 'Limited 2', 'Spend this reserve whenever you place a mine to place a second mine as a free action. This second mine does not count against that system''s Limited item count.', 'A couple of spare mines you found at the bottom of a crate.', 45),
  ('r1-46', 1, 'WIDE AREA IMPACT DISTRIBUTOR', 'Reaction', 'Limited 1', 'Trigger: You take any damage from a ranged or melee attack. Effect: The damage of that attack is immediately reduced to 1 and is applied to you and all characters within Range 5. This single point of damage cannot be reduced in any way.', 'A peculiar energy shield that relies on expanded surface area to lessen the impact of hostile munitions. One mech''s surface alone is rarely enough, so it uses instantaneous substatic pings to borrow the rest.', 46),
  ('r1-47', 1, 'MAG LASSO', 'Reaction', 'Limited 2', 'Trigger: An allied character within Range 5 takes Kinetic or Explosive damage. Effect: You may deal half of that damage to a hostile character within Range 5.', 'A hollow, high-tech node installed somewhere in your mech''s hand. Many pilots prefer the palm for dramatic effect, but anywhere will do. Catches bullets and missiles as easy as dandelions.', 47),
  ('r1-48', 1, 'REACTOR BLUFF', 'Quick Action', 'Limited 2', 'Spend this reserve as a quick action to immediately enter the Danger Zone with no heat gain. This lasts until the end of the current turn. You may still gain heat through other means normally.', 'Reactors aren''t smart. They don''t think, they don''t reason, they don''t solve problems. But they can be tricked.', 48),
  ('r1-49', 1, 'VOLATILE ENERGY CELL', 'Free Action', 'Limited 2', 'When you deal any Energy damage, spend this reserve to deal 2 Burn as bonus damage.', 'There''s a little tab you can rip off at the end of the cell. Yeah, right there, that''s the-Woah, woah, woah! Don''t do it NOW you idiot!!!', 49),
  ('r1-50', 1, 'KINGS_FOLLOWUP.EXE', 'Full Action', 'Limited 2', 'Spend this reserve to target a hostile unit in line of sight and sensors that has any Burn. That character immediately takes damage as if they had failed the end of turn Engineering check to clear Burn.', 'A sinister invasion package that interferes with a mech''s fire suppression features.', 50),
  ('r2-01', 2, 'SLINGSHOT PORTAL', 'Quick Action', '1/scene', 'Place a marker on your current space, then immediately teleport to any free space within Range 20 and line of sight. You automatically teleport back to that marker at the end of your next turn unless you''re Stunned or Immobilized.', 'The Slingshot Portal was originally designed for clandestine scouting maneuvers, but field captains quickly discovered its offensive potential.', 51),
  ('r2-02', 2, 'PURVIEW-GRADE DUCT TAPE', 'Free Action', '1/mission or operation', 'Repair a destroyed weapon or system without spending your Repair Cap.', 'Sometimes the best solutions in life are cheap. Unfortunately, Harrison Armory doesn''t make anything cheap.', 52),
  ('r2-03', 2, 'COOLANT RIG', 'Passive', '', 'Each time you gain heat from a hostile source, the total amount of heat is reduced by 1.', 'A complex network of pipes, tubes, and pads strategically set up around your reactor to ensure that you can push it a little harder than usual.', 53),
  ('r2-04', 2, 'INSIGHT-CLASS COMP/CON', 'Free Action', '1/scene', '1/scene, perform one quick action as a free action. It cannot be an attack and it cannot force a save.', 'The Insight-Class is designed to help you maintain a tactical advantage while you focus on more aggressive maneuvers.', 54),
  ('r2-05', 2, 'RADIANT TARGET ACTUATOR', 'Passive', '1/round', '1/round, If you don''t move before firing a Launcher, you get +1 Accuracy.', 'A software update that improves each missile''s ability to maintain target priority. They just need a second or two to make a lock.', 55),
  ('r2-06', 2, 'COUNTERWEIGHT POMMEL', 'Passive', '', 'If your melee weapons don''t have the Reliable tag, they gain Reliable 1. If they already have the Reliable tag, its value increases by 1.', 'A pommel printed to the exact weight and specifications of your weapon allowing for field-optimal balance.', 56),
  ('r2-07', 2, 'PISTON BRACE', 'Reaction', '1/round', 'Trigger: An enemy knocks you back. Effect: You may ignore that movement.', 'Emergency-launch pistons installed in the calves or feet of your mech. Whenever you find yourself stumbling, they''ll be there to catch your fall.', 57),
  ('r2-08', 2, 'FORCED REBOOT PACKAGE', 'Quick Action', '1/scene', '1/scene, you may clear the Stunned condition for you or an adjacent allied character as a quick action. This can be used even while Stunned. You or your ally then become Impaired and Slowed until the end of their next turn.', 'Being stunned is considered by many pilots to be a worst-case scenario, but it''s nothing a little software can''t fix.', 58),
  ('r2-09', 2, 'CHIP SHIELDS', 'Passive', '1/round', '1/round, If you would only take 1 damage from a ranged or melee attack, reduce it to 0 damage.', 'An overshield with an extremely low energy draw. It isn''t strong enough to ward off direct attacks, but it''s sufficient enough to let you ignore ambient wear and tear.', 59),
  ('r2-10', 2, 'TREMOR CHARGE', 'Passive', '1/scene', '1/scene, any knockback effect you inflict on a hostile character also knocks them prone, if it doesn''t already.', 'An explosive charge that detonates upon impact with the target. While it doesn''t do any physical damage, it will knock them off their feet.', 60),
  ('r2-11', 2, 'EMERGENCY FOAM DISPENCER', 'Passive', '1/scene', '1/scene, automatically clear any burn you have at the end of your turn.', 'For untold thousands of years, fire has remained one of mankind''s cruelest and most effective weapons. You''d be a fool not to expect it.', 61),
  ('r2-12', 2, 'PLIABLE EXPLOSIVE CASING', 'Passive', '', 'All grenades can be thrown an additional 1 space.', 'Gives your grenades a little extra bounce.', 62),
  ('r2-13', 2, 'GHILLIE MANTLE', 'Reaction', '1/scene', 'Trigger: You''re targeted by a ranged attack while benefiting from hard cover. Effect: You count as Invisible until the attack resolves.', 'Most combat theorists will tell you that mundane camouflage is useless in this era of high tech weaponry, but experienced mercenaries know that there''s a big difference between theory and praxis.', 63),
  ('r2-14', 2, 'USHTABI ROUND', 'Protocol', '1/scene', '1/scene, the next successful attack you make with a ranged weapon deals the average of its total damage based on the number of dice rolled, as follows: 1d3 (2), 1d6 (4), 2d6 (7), 3d6 (11), 4d6 (14).', 'Try not to look at this bullet too hard.', 64),
  ('r2-15', 2, 'EXTENDED BARREL', 'Passive', '', 'All Rifle weapons have their maximum Range increased by 1.', 'Every meter counts.', 65),
  ('r2-16', 2, 'DEVASTATOR SHELLS', 'Passive', '', 'All Cannon weapons ignore soft cover.', 'At a certain point, the amount of damage a gun can dole out will nullify any opposing terrain advantage.', 66),
  ('r2-17', 2, 'BREACHER DOCTRINE', 'Free Action', '1/round', '1/round, before skirmishing with a CQB weapon, you may move 1 space. This movement ignores engagement and does not provoke reactions.', 'A software package that allows your mech finer motor control in high-collision environments.', 67),
  ('r2-18', 2, 'HEAVY SHIELD', 'Passive', '', 'Adjacent allied characters can use you for hard cover.', 'Installs on forearm-mounted hardpoints, leaving your off-hand free for more offensive tasks.', 68),
  ('r2-19', 2, 'VOLATILE CATALYST', 'Passive', '1/round', '1/round, whenever you deal energy damage to a hostile character, deal 1 Energy damage to one other hostile character adjacent to the target.', 'A moderately sized deck charger that allows you to overclock your weapon''s energy cells.', 69),
  ('r2-20', 2, 'ADVANCED PRINTING MATERIALS', 'Passive', '', 'All of your drones and deployables have +1 Armor.', 'Figure that the cost of drone repair ends up being more in the long run than the cost of a little extra armor.', 70),
  ('r2-21', 2, 'SCATTER MALWARE', 'Reaction', '1/round', 'Trigger: You trigger an enemy''s Overwatch. Effect: You count as having soft cover until the attack is resolved.', 'A reactive invasion package that distorts your profile on the enemy''s HUD just enough to make you annoying to hit.', 71),
  ('r2-22', 2, 'DONKEY BRACE', 'Free Action', '1/scene', '1/scene, you may ignore the Ordnance tag for one attack.', 'A back-mounted brace that allows you to bring heavier munitions to bear without sacrificing mobility. As robust as this brace is, however, it can only be used a limited number of times before snapping clean in half.', 72),
  ('r2-23', 2, 'EFFICIENT ENERGY EMMITERS', 'Passive', '1/round', '1/round, When you gain any Overshields, gain 1 extra point of Overshields.', 'You''d be amazed how much energy goes to waste in most contemporary shielding systems.', 73),
  ('r2-24', 2, 'FIELD PATCH', 'Protocol', '1/scene', '1/scene, remove the Shredded condition as a protocol, but become Slowed until the end of your next turn.', 'A quick-seal adhesive slab of metal that slaps over any damage your outer chassis may receive. A bit cumbersome to use in the heat of battle, however.', 74),
  ('r2-25', 2, 'BULL EXO-FRAME', 'Passive', '', 'Moving adjacent to characters the same size as you does not stop your movement. Larger characters can still stop you as normal, however.', 'A bulky mantle that fits over your mech''s shoulders, allowing you to quite literally charge past whatever hostile may stand in your way.', 75),
  ('r2-26', 2, 'XC HARDPOINTS', 'Reaction', '1/scene', 'Trigger: You''re successfully hit by a weapon with the Armor-Piercing tag. Effect: You may ignore that tag for this attack only, allowing your Armor to reduce the damage dealt as normal.', 'Strategically placed support hardpoints that increase the effective longevity of your chassis armor.', 76),
  ('r2-27', 2, 'TACTICAL SENSOR SUITE', 'Passive', '', 'Your sensors get +5 Range when you use the Lock On or Scan quick tech actions.', 'A software update that boosts your short-range sensors, but only if you keep your finger off the trigger for once in your life.', 77),
  ('r2-28', 2, 'LOCKJAW VIRUS', 'Passive', '1/round', '1/round, whenever you successfully hit a hostile character with a tech attack, that character gets +1 Difficulty to the next ranged, melee, or tech attack they make against you.', 'It''s just good strategy to prioritize enemy hackers on the field of battle. But what do you do if you are the enemy hacker?', 78),
  ('r2-29', 2, 'ADAPTABLE FIREWALL', 'Reaction', '1/scene', 'Trigger: You''re successfully hit by a hostile tech attack. Effect: You count as Invisible for the next tech attack that targets you.', 'A defense package that rapidly reprograms itself to keep up with enemy cyber-doctrine.', 79),
  ('r2-30', 2, '"BLACK EYE" FUEL CANISTER', 'Protocol', '1/round', '1/round, the first attack you make that deals any amount of Burn damage gains the Reliable 2 tag. This reliable damage is applied as Burn.', 'Don''t look directly at the flames. They''ve been known to cause the careless eye to bleed.', 80),
  ('r2-31', 2, 'DEFENSIVE EMP', 'Passive', '', 'When you Brace, all adjacent characters are Jammed until the end of their next turn.', 'A core-mounted emitter that releases an electro-magnetic pulse strong enough to scramble anyone breathing down your neck. Just don''t use it around your friends, or they''ll give you an earful... as soon as their comms are back up, anyway.', 81),
  ('r2-32', 2, 'TATTLETALE SCOPE', 'Passive', '1/round', '1/round, when you hit with a ranged or tech attack, you learn the target''s HP and Heat.', 'Most pilots can estimate how much damage an enemy can take with a bit of napkin math, but why guess?', 82),
  ('r2-33', 2, 'RESPONSIVE MOBILITY PACKAGE', 'Quick Action', '1/scene', '1/scene, when you Boost while adjacent to an allied character, that character may also Boost their speed in any direction.', 'A software package that links your maneuvering systems with a friendly computer, allowing for synchronized assaults.', 83),
  ('r2-34', 2, 'CHRONOMETRIC SCRAMBLER', 'Reaction', '1/scene', 'Trigger: Any hostile character successfully attacks, passes a save or check, or otherwise successfully rolls a die (including NPC feature recharging). Effect: The attack misses, the save or check is failed, or the dice successfully rolled is now a failure, etc. You immediately take 3 heat and become Impaired until the end of your next turn.', '"Whew, that was a close one." "What was?"', 84),
  ('r2-35', 2, 'LOCUST PROJECTOR', 'Quick Action', '1/round, Drone', 'Deploy the Locust Projector within sensors and line of sight as a quick action. Once deployed, the Locust Projector emits a Burst 1 field. All characters in this field gain soft cover and have Immunity to all damage and effects from missed attacks. (Locust Projector: Size: 1/2, HP 5, Evasion 10, EDef 10)', 'A crab-like drone about the size of a dumpster. It''s equipped with a suite of point-defense armaments that can intercept anything short of a direct hit.', 85),
  ('r2-36', 2, 'REBOUND FIREWALL', 'Passive', '1/scene', '1/scene, if you gain the Jammed condition from a hostile character, that character is immediately Jammed, as well.', 'Oh yeah? Screw you, too, buddy! ... I said-uhhh, I said, ''screw you, too.'' Do you copy? ... Hello?', 86),
  ('r2-37', 2, 'FIELD PATTERN IDENTIFIER', 'Free Action', '1/round', '1/round, Whenever you push or pull a hostile character, you may move 1 space. This movement ignores engagement and does not provoke reactions.', 'An upgrade to your sensors that allows you to analyze the rapidly evolving variables of any battlefield, plotting the best possible maneuvers to capitalize on an already good situation.', 87),
  ('r2-38', 2, 'SELF-DETONATING DEBRIS CANNISTER', 'Quick Action', '1/scene', '1/scene, create a Blast 1 zone of difficult terrain in a free adjacent space as a quick action. This zone lasts for the rest of the scene.', 'A canister full of shrapnel, razor-wire, caltrops, and other similarly hazardous traps. No-man''s land on demand.', 88),
  ('r2-39', 2, 'CO-PILOT ASSISTANCE SUITE', 'Passive', '', 'Your Overwatch attacks can never suffer from Difficulty.', 'A targeting suite developed from IPS-N''s WATCHDOG program, but with a greatly reduced cerebral load.', 89),
  ('r2-40', 2, 'FIRE SUPPORT APPENDAGES', 'Free Action', '1/scene', '1/scene, when you Critically Hit with any ranged or melee attack, you may reload one Loading weapon as a free action.', 'A pair of externally mounted arms that handle the more mundane tasks you don''t have the time to bother with.', 90),
  ('r2-41', 2, 'REDLINE THRUSTERS', 'Free Action', '1/scene', '1/scene, you may Boost as a free action. You cannot Boost again on this turn except through Overcharge.', 'A pair of back-mounted thrusters that allow you to push your mech beyond factory-recommended speeds.', 91),
  ('r2-42', 2, 'FULL SERVICE EXO-DRONES', 'Passive', '', 'Your Stabilize full action now clears one additional condition that wasn''t caused by one of your own systems, talents, etc. This can be applied to either yourself or an adjacent allied character.', 'A pair of small, spider-like drones that excel in quick repairs in the heat of combat.', 92),
  ('r2-43', 2, '"BLOODWATER" CHAFF LAUNCHER', 'Passive', '1/round', '1/round, whenever you inflict Impaired on a hostile character, they must also pass a Hull save or become Slowed.', 'A shoulder-mounted launcher that automatically fires a volley of exploding chaff at weakened hostiles. Does negligible damage, but keeps the target effectively neutered.', 93),
  ('r2-44', 2, 'POWER FIST', 'Passive', '', 'The first Grapple or Ram you make in a round has +1 Accuracy.', 'A large, oversized gauntlet that fits over one of your mech''s hands. Grants the wearer uncontested dominance in close-quarters sparring.', 94),
  ('r2-45', 2, 'CLUTTER PACKAGE', 'Passive', '', 'Your Invade quick tech action deals 1 additional heat.', 'Quadruples the size of your basic cyber invasion package with useless data, forcing the enemy computer to draw an equivalent amount of power just to keep all of it out.', 95),
  ('r2-46', 2, 'BLINDSIGHT TARGETING LASER', 'Passive', '1/round', '1/round, When you Lock On to a hostile character, they must pass a Systems save or become unable to make voluntarily movements that bring them closer to you until the end of their next turn. Cannot be used on the same character more than 1/scene.', 'A head-mounted laser that paints a hostile for local target acquisition. As a side benefit, it triggers the enemy mech''s danger-proximity sensors, effectively treating you as if you were an active supernova.', 96),
  ('r2-47', 2, 'CONTACT BOOSTERS', 'Reaction', '1/round', 'Trigger: A hostile character ends movement adjacent to you. Effect: You move 1 space in any direction. This movement ignores engagement and does not provoke reactions.', 'Ancillary boosters that are programmed to activate when they detect the immediate proximity of hostile units.', 97),
  ('r2-48', 2, 'IFF SMART MUNITIONS', 'Passive', '', 'You and your allies gain Immunity to damage from your own Blast and Cone attacks.', 'Become the most popular guy in the hangar.', 98),
  ('r2-49', 2, 'REFLECTIVE COATING', 'Free Action', '1/scene', '1/scene, you may Hide as a free action.', 'A special coat of paint made from reflective alloys. A cheaper, if less reliable, stealth doctrine.', 99),
  ('r2-50', 2, '"OH CRAP" BUTTON', 'Free Action', '1/scene', '1/scene, If you miss with a Superheavy weapon, you may immediately Boost your speed in any direction.', 'A big red button that, when pressed, activates your mech''s boosters. Good way to get out of a bad play.', 100)

on conflict (key) do nothing;
