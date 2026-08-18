-- Adds a recurring due day and a default planned amount to each category.
-- Both are category-level (not per-month): they apply to every month automatically,
-- with no "copy into new budget" step needed. See constants/budgets.ts removal in the
-- same change — this replaces the old hardcoded DEFAULT_BUDGETS constant.
--
-- Run this once in the Supabase SQL editor (this repo has no migration runner).

alter table categories
  add column if not exists due_day integer,
  add column if not exists default_amount numeric;

alter table categories
  add constraint categories_due_day_range check (due_day is null or (due_day between 1 and 31));

alter table categories
  add constraint categories_default_amount_nonneg check (default_amount is null or default_amount >= 0);

-- One-time backfill: copy the values that used to live in the hardcoded
-- constants/budgets.ts DEFAULT_BUDGETS map into the new column, matched by
-- name, so removing that file doesn't silently reset anyone's defaults to 0.
-- Safe to run even if some/none of these names exist for a given user.
update categories set default_amount = case name
  when 'Ahorro 5%' then 500000
  when 'Arriendo' then 2200000
  when 'EPM' then 242338
  when 'Tigo Hogar' then 139900
  when 'Celular Daniel' then 75000
  when 'Mercado' then 1400000
  when 'Gasolina' then 300000
  when 'Lavado Carro' then 40000
  when 'Pasajes' then 50000
  when 'Transporte Isa' then 280000
  when 'Salud General' then 482435
  when 'Aporte Salud / Pensión' then 508300
  when 'Ahorro Salud 3%' then 300000
  when 'Seguro de Vida' then 12181
  when 'Google Daniel' then 15900
  when 'Google Julieth' then 8900
  when 'OpenAI' then 77163
  when 'Spotify' then 30500
  when 'Rappi Prime' then 29900
  when 'Netflix' then 29900
  when 'Unicef' then 35000
  when 'Barbería' then 40000
  when 'Guardería' then 554000
  when 'Gimnasio Julieth' then 110000
  when 'Mesada Daniel' then 300000
  when 'Mesada Julieth' then 300000
  when 'Ahorro Salidas 3%' then 200000
  when 'Gastos Isa' then 300000
  when 'Fechas Especiales' then 147300
  when 'Cristali' then 4200000
  when 'Carro' then 1320078
  when 'Seguro Todo Riesgo' then 323332
  else null
end
where name in (
  'Ahorro 5%', 'Arriendo', 'EPM', 'Tigo Hogar', 'Celular Daniel', 'Mercado',
  'Gasolina', 'Lavado Carro', 'Pasajes', 'Transporte Isa', 'Salud General',
  'Aporte Salud / Pensión', 'Ahorro Salud 3%', 'Seguro de Vida', 'Google Daniel',
  'Google Julieth', 'OpenAI', 'Spotify', 'Rappi Prime', 'Netflix', 'Unicef',
  'Barbería', 'Guardería', 'Gimnasio Julieth', 'Mesada Daniel', 'Mesada Julieth',
  'Ahorro Salidas 3%', 'Gastos Isa', 'Fechas Especiales', 'Cristali', 'Carro',
  'Seguro Todo Riesgo'
);
