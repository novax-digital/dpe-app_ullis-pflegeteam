INSERT INTO public.ebike_reservation_settings (
  id,
  safety_confirmation_enabled,
  safety_confirmation_text
)
VALUES (
  'default',
  true,
  $$Bitte beachte bei jeder Nutzung des E-Bikes:

- Halte dich jederzeit an die Verkehrsregeln.
- Trage während der Fahrt einen Helm.
- Schließe das E-Bike bei Pausen und nach der Rückgabe sicher ab.
- Lade das E-Bike nach der Rückgabe immer wieder auf.

Mit deiner Bestätigung übernimmst du diese Hinweise für deine Reservierung.$$
)
ON CONFLICT (id) DO UPDATE
SET
  safety_confirmation_enabled = EXCLUDED.safety_confirmation_enabled,
  safety_confirmation_text = EXCLUDED.safety_confirmation_text;
