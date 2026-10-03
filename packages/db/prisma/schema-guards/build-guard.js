import fs from 'node:fs';
const expected=JSON.parse(fs.readFileSync(new URL('./affiliate-schema.json',import.meta.url),'utf8'));
export function schemaGuardSql(strict=true) {
  return `-- Validate the definitions accepted by earlier IF NOT EXISTS migrations.
DO $schema_guard$
DECLARE expected jsonb := '${JSON.stringify(expected).replaceAll("'","''")}'::jsonb;
 item jsonb; actual record; relation regclass; labels text[];
BEGIN
 FOR item IN SELECT * FROM jsonb_array_elements(expected->'columns') LOOP
   relation := to_regclass(format('public.%I', item->>'table'));
   IF relation IS NULL THEN
     ${strict?"RAISE EXCEPTION 'Schema drift: missing table %', item->>'table';":"CONTINUE;"}
   END IF;
   SELECT format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required,
     pg_get_expr(d.adbin,d.adrelid) AS default_value INTO actual
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=relation AND a.attname=item->>'name' AND a.attnum>0 AND NOT a.attisdropped;
   IF NOT FOUND THEN
     ${strict?"RAISE EXCEPTION 'Schema drift: missing column %.%', item->>'table',item->>'name';":"CONTINUE;"}
   END IF;
   IF actual.type IS DISTINCT FROM item->>'type' OR actual.required IS DISTINCT FROM (item->>'required')::boolean
      OR actual.default_value IS DISTINCT FROM item->>'default' THEN
     RAISE EXCEPTION 'Schema drift: %.% type/nullability/default differs from migration definition', item->>'table',item->>'name';
   END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(expected->'constraints') LOOP
   relation := to_regclass(format('public.%I', item->>'table'));
   IF relation IS NULL AND NOT ${strict} THEN CONTINUE; END IF;
   SELECT pg_get_constraintdef(oid) AS definition, convalidated AS valid INTO actual
     FROM pg_constraint WHERE conrelid=relation AND conname=item->>'name';
   IF NOT FOUND THEN
     ${strict?"RAISE EXCEPTION 'Schema drift: missing constraint %',item->>'name';":"CONTINUE;"}
   END IF;
   IF actual.definition IS DISTINCT FROM item->>'definition' OR NOT actual.valid THEN
     RAISE EXCEPTION 'Schema drift: constraint % definition/validation differs',item->>'name';
   END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(expected->'indexes') LOOP
   relation := to_regclass(format('public.%I',item->>'name'));
   IF relation IS NULL THEN
     ${strict?"RAISE EXCEPTION 'Schema drift: missing index %',item->>'name';":"CONTINUE;"}
   END IF;
   SELECT pg_get_indexdef(indexrelid) AS definition, indisvalid AS valid, indisready AS ready
     INTO actual FROM pg_index WHERE indexrelid=relation;
   IF NOT FOUND THEN RAISE EXCEPTION 'Schema drift: % is not an index',item->>'name'; END IF;
   IF actual.definition IS DISTINCT FROM item->>'definition' OR NOT actual.valid OR NOT actual.ready THEN
     RAISE EXCEPTION 'Schema drift: index % definition/validity differs',item->>'name';
   END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(expected->'enums') LOOP
   IF to_regtype(format('public.%I',item->>'name')) IS NULL AND NOT ${strict} THEN CONTINUE; END IF;
   SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO labels FROM pg_enum e
     WHERE e.enumtypid=to_regtype(format('public.%I',item->>'name'));
   ${strict?`IF labels IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(item->'labels')) THEN
     RAISE EXCEPTION 'Schema drift: enum % labels differ',item->>'name'; END IF;`:
     `IF labels IS NULL OR NOT labels <@ ARRAY(SELECT jsonb_array_elements_text(item->'labels')) THEN
     RAISE EXCEPTION 'Schema drift: enum % has unexpected labels/type',item->>'name'; END IF;`}
 END LOOP;
END $schema_guard$;`;
}
