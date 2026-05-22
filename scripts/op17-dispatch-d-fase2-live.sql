-- OP-17 Dispatch D Live — Fase 2 a 5
-- Onde correr: Lovable Cloud → SQL Editor → Live
-- A Beatriz já foi feita na Fase 1, não está aqui.
-- Resultado esperado: 21 novos + 6 attached + 19 frentes com lead + 10 team rows
-- A última query devolve o CSV dos ~22 links de onboarding (exportar).

-- =========================================================
-- PARTE A — 21 perfis NOVOS (auth.users + identity + profile + role)
-- =========================================================
-- ===== Matheus Cunha =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'matheus@coalamusic.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Matheus Cunha","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'matheus@coalamusic.com';

UPDATE profiles
SET phone='+55 11 91359-9972', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Matheus Cunha'
WHERE email='matheus@coalamusic.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='matheus@coalamusic.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='matheus@coalamusic.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Francisco Ribeiro =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'francisco.ribeiro@stormproductions.pt',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Francisco Ribeiro","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'francisco.ribeiro@stormproductions.pt';

UPDATE profiles
SET phone='+351 968 079 105', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Francisco Ribeiro'
WHERE email='francisco.ribeiro@stormproductions.pt';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='francisco.ribeiro@stormproductions.pt')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='francisco.ribeiro@stormproductions.pt'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Ana Bracamp =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'ana.braamcamp@stormproductions.pt',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Ana Bracamp","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'ana.braamcamp@stormproductions.pt';

UPDATE profiles
SET phone='+351 917 268 173', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Ana Bracamp'
WHERE email='ana.braamcamp@stormproductions.pt';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='ana.braamcamp@stormproductions.pt')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='ana.braamcamp@stormproductions.pt'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Bruno Fonseca =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'dazzlebeat@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Bruno Fonseca","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'dazzlebeat@gmail.com';

UPDATE profiles
SET phone='+351 963 816 369', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Bruno Fonseca'
WHERE email='dazzlebeat@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='dazzlebeat@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='dazzlebeat@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Andrew Costa =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'andrewcostabrpt@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Andrew Costa","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'andrewcostabrpt@gmail.com';

UPDATE profiles
SET phone='+351 937 220 817', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Andrew Costa'
WHERE email='andrewcostabrpt@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='andrewcostabrpt@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='andrewcostabrpt@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Henrique Anacleto =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'henrique@coalamusic.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Henrique Anacleto","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'henrique@coalamusic.com';

UPDATE profiles
SET phone='+55 17 98108-2428', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Henrique Anacleto'
WHERE email='henrique@coalamusic.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='henrique@coalamusic.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='henrique@coalamusic.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Juliana Mattos =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'marketingmundopropicio@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Juliana Mattos","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'marketingmundopropicio@gmail.com';

UPDATE profiles
SET phone='+351 933 231 951', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Juliana Mattos'
WHERE email='marketingmundopropicio@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='marketingmundopropicio@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='marketingmundopropicio@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Arthur Ferraz =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'arthur.ferraz.pt@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Arthur Ferraz","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'arthur.ferraz.pt@gmail.com';

UPDATE profiles
SET phone='+351 969 671 635', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Arthur Ferraz'
WHERE email='arthur.ferraz.pt@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='arthur.ferraz.pt@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='arthur.ferraz.pt@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Mariana Cespedes =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'eventos.cespedes@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Mariana Cespedes","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'eventos.cespedes@gmail.com';

UPDATE profiles
SET phone='+351 920 459 438', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Mariana Cespedes'
WHERE email='eventos.cespedes@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='eventos.cespedes@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='eventos.cespedes@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Tobé Lombello =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'tobelombello@freakhouse.com.br',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Tobé Lombello","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'tobelombello@freakhouse.com.br';

UPDATE profiles
SET phone='+55 11 98325-1344', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Tobé Lombello'
WHERE email='tobelombello@freakhouse.com.br';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='tobelombello@freakhouse.com.br')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='tobelombello@freakhouse.com.br'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Leonardo Santos =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'leonardo-santos@outlook.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Leonardo Santos","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'leonardo-santos@outlook.com';

UPDATE profiles
SET phone='+351 916 230 709', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Leonardo Santos'
WHERE email='leonardo-santos@outlook.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='leonardo-santos@outlook.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='leonardo-santos@outlook.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Fabio Mendonça Jr. =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'fabioferreira.mjr@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Fabio Mendonça Jr.","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'fabioferreira.mjr@gmail.com';

UPDATE profiles
SET phone='+351 965 188 186', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Fabio Mendonça Jr.'
WHERE email='fabioferreira.mjr@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='fabioferreira.mjr@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='fabioferreira.mjr@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== João Henrique =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'joao.souza@divertieventos.com.br',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"João Henrique","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'joao.souza@divertieventos.com.br';

UPDATE profiles
SET phone='+55 11 97540-4455', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='João Henrique'
WHERE email='joao.souza@divertieventos.com.br';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='joao.souza@divertieventos.com.br')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='joao.souza@divertieventos.com.br'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Italo Rafael =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'italo@coalamusic.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Italo Rafael","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'italo@coalamusic.com';

UPDATE profiles
SET phone='+55 11 91699-9187', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Italo Rafael'
WHERE email='italo@coalamusic.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='italo@coalamusic.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='italo@coalamusic.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Thais Amarela =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'jesusthaislp@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Thais Amarela","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'jesusthaislp@gmail.com';

UPDATE profiles
SET phone='+351 925 369 359', profile_type='user',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Thais Amarela'
WHERE email='jesusthaislp@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='jesusthaislp@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='jesusthaislp@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Fábio (palco 2) =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'fabiosantosbrito@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Fábio (palco 2)","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'fabiosantosbrito@gmail.com';

UPDATE profiles
SET phone='+351 918 056 226', profile_type='field_staff',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Fábio (palco 2)'
WHERE email='fabiosantosbrito@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='fabiosantosbrito@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'field_producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='fabiosantosbrito@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Thaina Hofmann =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'thaina.eventos.pt@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Thaina Hofmann","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'thaina.eventos.pt@gmail.com';

UPDATE profiles
SET phone='+351 912 314 252', profile_type='field_staff',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Thaina Hofmann'
WHERE email='thaina.eventos.pt@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='thaina.eventos.pt@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'field_producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='thaina.eventos.pt@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Gabriela Abreu =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'gabrielaabreu351@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Gabriela Abreu","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'gabrielaabreu351@gmail.com';

UPDATE profiles
SET phone='+351 963 524 856', profile_type='field_staff',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Gabriela Abreu'
WHERE email='gabrielaabreu351@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='gabrielaabreu351@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'field_producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='gabrielaabreu351@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Laura Scótolo =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'laura.scotolo@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Laura Scótolo","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'laura.scotolo@gmail.com';

UPDATE profiles
SET phone='+351 933 211 739', profile_type='field_staff',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Laura Scótolo'
WHERE email='laura.scotolo@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='laura.scotolo@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'field_producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='laura.scotolo@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Rafaella Soares =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'rafaellasr3635@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Rafaella Soares","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'rafaellasr3635@gmail.com';

UPDATE profiles
SET phone='+351 912 581 456', profile_type='field_staff',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Rafaella Soares'
WHERE email='rafaellasr3635@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='rafaellasr3635@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'field_producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='rafaellasr3635@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;
-- ===== Júlia Pedro =====
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated','authenticated',
  'julia.pedro33@gmail.com',
  crypt('PlaceholderPwToReplace!2026', gen_salt('bf')),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Júlia Pedro","company_id":"7d831e59-6e82-427b-95a0-64904aae5dd2"}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', false),
  'email', u.id::text, now(), now(), now()
FROM auth.users u WHERE u.email = 'julia.pedro33@gmail.com';

UPDATE profiles
SET phone='+351 927 407 036', profile_type='field_staff',
    is_operacao_only=true, first_access_token=gen_random_uuid(),
    full_name='Júlia Pedro'
WHERE email='julia.pedro33@gmail.com';

DELETE FROM user_roles
WHERE user_id=(SELECT id FROM profiles WHERE email='julia.pedro33@gmail.com')
  AND role='user' AND company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';

INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'field_producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE email='julia.pedro33@gmail.com'
ON CONFLICT (user_id, role, company_id) DO NOTHING;

-- =========================================================
-- PARTE B — 6 perfis MP EXISTENTES (só user_roles na Coala)
-- =========================================================
INSERT INTO user_roles (user_id, role, company_id)
SELECT id, 'producer', '7d831e59-6e82-427b-95a0-64904aae5dd2'
FROM profiles WHERE lower(email) IN (
  'producaotec@mundopropicio.com',     -- Gilberto Farias
  'producao@mundopropicio.com',        -- Juliana Martins
  'producaoexec@mundopropicio.com',    -- Suelen Pierini
  'adm@mundopropicio.com',             -- Délia Braga
  'geral@mundopropicio.com',           -- Leticia Rangel
  'liliammirandaprodutoramp@gmail.com' -- Liliam Miranda
)
ON CONFLICT (user_id, role, company_id) DO NOTHING;

-- =========================================================
-- PARTE C — Preencher current_lead_id das 19 frentes
-- =========================================================
UPDATE operacao_frentes f SET current_lead_id = p.id
FROM profiles p
WHERE f.event_id = '5a1da5fb-3115-4ae3-af50-15ce1f869a5c'
  AND lower(p.email) = CASE f.name
    WHEN 'Palco Principal' THEN 'tobelombello@freakhouse.com.br'
    WHEN 'Palco 2' THEN 'leonardo-santos@outlook.com'
    WHEN 'Área VIP' THEN 'fabioferreira.mjr@gmail.com'
    WHEN 'Camarins (A&B)' THEN 'liliammirandaprodutoramp@gmail.com'
    WHEN 'Credenciamento' THEN 'eventos.cespedes@gmail.com'
    WHEN 'Bares e Foods' THEN 'joao.souza@divertieventos.com.br'
    WHEN 'Merchadising' THEN 'italo@coalamusic.com'
    WHEN 'Produção Geral' THEN 'bea@coalamusic.com'
    WHEN 'Produção Backstage / Artístico' THEN 'ana.braamcamp@stormproductions.pt'
    WHEN 'Produção Stage Hands' THEN 'dazzlebeat@gmail.com'
    WHEN 'Controle de Acessos / Segurança / Estacionamento' THEN 'producaoexec@mundopropicio.com'
    WHEN 'Sustentabilidade' THEN 'andrewcostabrpt@gmail.com'
    WHEN 'Marketing / Marcas' THEN 'henrique@coalamusic.com'
    WHEN 'Mídias e Redes Sociais' THEN 'marketingmundopropicio@gmail.com'
    WHEN 'Financeiro / Cashless / Pulseiras VIP' THEN 'adm@mundopropicio.com'
    WHEN 'Logística Artística' THEN 'arthur.ferraz.pt@gmail.com'
    WHEN 'Voluntários / Compras / Comunicação' THEN 'geral@mundopropicio.com'
    WHEN 'Limpeza / Banheiros' THEN 'jesusthaislp@gmail.com'
    ELSE NULL
  END;

-- =========================================================
-- PARTE D — Teams (co-líderes + auxiliares)
-- =========================================================
-- Co-líderes Produção Geral
INSERT INTO operacao_frente_team (frente_id, profile_id, role_in_frente, is_permanent_lead, company_id, active)
SELECT f.id, p.id, 'lead', false, '7d831e59-6e82-427b-95a0-64904aae5dd2', true
FROM operacao_frentes f, profiles p
WHERE f.event_id='5a1da5fb-3115-4ae3-af50-15ce1f869a5c' AND f.name='Produção Geral'
  AND lower(p.email) IN ('producaotec@mundopropicio.com','matheus@coalamusic.com','producao@mundopropicio.com','francisco.ribeiro@stormproductions.pt')
ON CONFLICT DO NOTHING;

-- Auxiliares
INSERT INTO operacao_frente_team (frente_id, profile_id, role_in_frente, is_permanent_lead, company_id, active)
SELECT f.id, p.id, 'auxiliary', false, '7d831e59-6e82-427b-95a0-64904aae5dd2', true
FROM operacao_frentes f, profiles p
WHERE f.event_id='5a1da5fb-3115-4ae3-af50-15ce1f869a5c'
  AND (
    (f.name='Palco 2' AND lower(p.email)='fabiosantosbrito@gmail.com')
    OR (f.name='Credenciamento' AND lower(p.email) IN ('thaina.eventos.pt@gmail.com','gabrielaabreu351@gmail.com'))
    OR (f.name='Apoio Artístico (29-31 mai)' AND lower(p.email) IN ('laura.scotolo@gmail.com','rafaellasr3635@gmail.com','julia.pedro33@gmail.com'))
  )
ON CONFLICT DO NOTHING;

-- =========================================================
-- PARTE E — Validação + CSV de links
-- =========================================================
SELECT 'frentes com lead' AS check, count(*) FILTER (WHERE current_lead_id IS NOT NULL) || '/' || count(*) AS resultado
FROM operacao_frentes WHERE event_id='5a1da5fb-3115-4ae3-af50-15ce1f869a5c'
UNION ALL
SELECT 'team rows', count(*)::text FROM operacao_frente_team t
  JOIN operacao_frentes f ON f.id=t.frente_id WHERE f.event_id='5a1da5fb-3115-4ae3-af50-15ce1f869a5c'
UNION ALL
SELECT 'perfis com token', count(*)::text FROM profiles
  WHERE first_access_token IS NOT NULL
  AND id IN (SELECT user_id FROM user_roles WHERE company_id='7d831e59-6e82-427b-95a0-64904aae5dd2');

-- CSV final dos links de onboarding (exportar)
SELECT p.full_name, p.email, p.phone,
  'https://www.mpgestaoeventos.com/operacao/onboarding?token=' || p.first_access_token::text AS onboarding_link
FROM profiles p
WHERE p.first_access_token IS NOT NULL
  AND p.id IN (SELECT user_id FROM user_roles WHERE company_id='7d831e59-6e82-427b-95a0-64904aae5dd2' AND role IN ('producer','field_producer'))
ORDER BY p.full_name;
