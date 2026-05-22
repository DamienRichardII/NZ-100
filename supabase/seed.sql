-- ============================================================
-- NZ 100% -- SEED DATA v3 (idempotent, UUIDs valides)
-- A executer APRES schema.sql ET policies.sql
-- Sur a re-executer : ON CONFLICT ... DO NOTHING
--
-- Convention UUIDs fixes (format hex valide) :
--   Programmes  : a000000X-0000-0000-0000-000000000000  (X=1..5)
--   Modules     : b000000P-0000-MMMM-0000-000000000000  (P=prog, M=module)
--   Contenus    : c000000P-MMMM-CCCC-0000-000000000000  (P=prog, M=module, C=contenu)
-- ============================================================


-- ============================================================
-- PROGRAMMES (5)
-- ON CONFLICT (slug) : slug est UNIQUE dans le schema
-- ============================================================

INSERT INTO programs
  (id, slug, title, subtitle, description, price_eur, duration_weeks, is_active, position)
VALUES
(
  'a0000001-0000-0000-0000-000000000000',
  'nz-perte-de-poids',
  'NZ Perte de Poids',
  'Brule les graisses, garde le muscle',
  'Programme complet combinant entrainement fonctionnel et nutrition adaptee pour perdre du poids durablement sans sacrifier la masse musculaire.',
  299,
  12,
  true,
  1
),
(
  'a0000002-0000-0000-0000-000000000000',
  'nz-remise-en-forme',
  'NZ Remise en Forme',
  'Retrouve ton niveau, depasse-le',
  'Ideal apres une periode sedentaire ou une blessure legere. Progression douce mais exigeante pour retrouver forme et energie.',
  249,
  8,
  true,
  2
),
(
  'a0000003-0000-0000-0000-000000000000',
  'nz-retour-au-sport',
  'NZ Retour au Sport',
  'Reprends le dessus apres larret',
  'Programme de reprise progressive apres blessure ou longue interruption. Travail de reeducation fonctionnelle et remise en confiance.',
  349,
  10,
  true,
  3
),
(
  'a0000004-0000-0000-0000-000000000000',
  'nz-performance',
  'NZ Performance',
  'Passe au niveau superieur',
  'Pour les sportifs deja actifs qui veulent franchir un cap. Entrainement intensif, periodisation, recuperation optimisee.',
  399,
  16,
  true,
  4
),
(
  'a0000005-0000-0000-0000-000000000000',
  'nz-basket',
  'NZ Basket',
  'Coaching basketball personnalise',
  'Coaching technique et physique dedie au basketball. Dribble, tir, defense, explosivite adapte a tous les niveaux et tous les ages.',
  199,
  8,
  true,
  5
)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- MODULES -- NZ Perte de Poids  (programme 1, 8 modules)
-- ============================================================

INSERT INTO program_modules (id, program_id, title, position) VALUES
('b0000001-0000-0001-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Introduction et Bilan', 1),
('b0000001-0000-0002-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Fondations du mouvement', 2),
('b0000001-0000-0003-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Nutrition anti-inflammatoire', 3),
('b0000001-0000-0004-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Cardio et Depense energetique', 4),
('b0000001-0000-0005-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Musculation fonctionnelle', 5),
('b0000001-0000-0006-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Bilan mi-parcours et Ajustements', 6),
('b0000001-0000-0007-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Phase intensive', 7),
('b0000001-0000-0008-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'Consolidation et Resultats', 8)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- MODULES -- NZ Remise en Forme  (programme 2, 6 modules)
-- ============================================================

INSERT INTO program_modules (id, program_id, title, position) VALUES
('b0000002-0000-0001-0000-000000000000', 'a0000002-0000-0000-0000-000000000000', 'Evaluation de depart', 1),
('b0000002-0000-0002-0000-000000000000', 'a0000002-0000-0000-0000-000000000000', 'Remobilisation articulaire', 2),
('b0000002-0000-0003-0000-000000000000', 'a0000002-0000-0000-0000-000000000000', 'Endurance de base', 3),
('b0000002-0000-0004-0000-000000000000', 'a0000002-0000-0000-0000-000000000000', 'Force et Tonicite', 4),
('b0000002-0000-0005-0000-000000000000', 'a0000002-0000-0000-0000-000000000000', 'Nutrition equilibree', 5),
('b0000002-0000-0006-0000-000000000000', 'a0000002-0000-0000-0000-000000000000', 'Resultats et Suite du parcours', 6)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- MODULES -- NZ Retour au Sport  (programme 3, 6 modules)
-- ============================================================

INSERT INTO program_modules (id, program_id, title, position) VALUES
('b0000003-0000-0001-0000-000000000000', 'a0000003-0000-0000-0000-000000000000', 'Bilan post-arret', 1),
('b0000003-0000-0002-0000-000000000000', 'a0000003-0000-0000-0000-000000000000', 'Reeducation fonctionnelle', 2),
('b0000003-0000-0003-0000-000000000000', 'a0000003-0000-0000-0000-000000000000', 'Reconditionnement progressif', 3),
('b0000003-0000-0004-0000-000000000000', 'a0000003-0000-0000-0000-000000000000', 'Renforcement cible', 4),
('b0000003-0000-0005-0000-000000000000', 'a0000003-0000-0000-0000-000000000000', 'Reprise technique', 5),
('b0000003-0000-0006-0000-000000000000', 'a0000003-0000-0000-0000-000000000000', 'Validation et Prevention des rechutes', 6)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- MODULES -- NZ Performance  (programme 4, 9 modules)
-- ============================================================

INSERT INTO program_modules (id, program_id, title, position) VALUES
('b0000004-0000-0001-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Profil athletique', 1),
('b0000004-0000-0002-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Programmation et Periodisation', 2),
('b0000004-0000-0003-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Force maximale', 3),
('b0000004-0000-0004-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Vitesse et Explosivite', 4),
('b0000004-0000-0005-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Endurance specifique', 5),
('b0000004-0000-0006-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Nutrition de performance', 6),
('b0000004-0000-0007-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Recuperation et Sommeil', 7),
('b0000004-0000-0008-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Phase de pic', 8),
('b0000004-0000-0009-0000-000000000000', 'a0000004-0000-0000-0000-000000000000', 'Maintien et Progression long terme', 9)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- MODULES -- NZ Basket  (programme 5, 6 modules)
-- ============================================================

INSERT INTO program_modules (id, program_id, title, position) VALUES
('b0000005-0000-0001-0000-000000000000', 'a0000005-0000-0000-0000-000000000000', 'Analyse du joueur', 1),
('b0000005-0000-0002-0000-000000000000', 'a0000005-0000-0000-0000-000000000000', 'Maniement de balle et Dribble', 2),
('b0000005-0000-0003-0000-000000000000', 'a0000005-0000-0000-0000-000000000000', 'Tir et Technique offensive', 3),
('b0000005-0000-0004-0000-000000000000', 'a0000005-0000-0000-0000-000000000000', 'Defense et Lecture du jeu', 4),
('b0000005-0000-0005-0000-000000000000', 'a0000005-0000-0000-0000-000000000000', 'Preparation physique basket', 5),
('b0000005-0000-0006-0000-000000000000', 'a0000005-0000-0000-0000-000000000000', 'Bilan et Objectifs saison', 6)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- CONTENUS -- NZ Perte de Poids / Module 1 : Introduction et Bilan
-- ============================================================

INSERT INTO program_contents
  (id, module_id, title, content_type, content_url, description, position, duration_min)
VALUES
(
  'c0000001-0001-0001-0000-000000000000',
  'b0000001-0000-0001-0000-000000000000',
  'Bienvenue dans le programme',
  'video',
  null,
  'Presentation du programme, de la methode NZ et des objectifs des 12 semaines.',
  1,
  8
),
(
  'c0000001-0001-0002-0000-000000000000',
  'b0000001-0000-0001-0000-000000000000',
  'Questionnaire de bilan initial',
  'pdf',
  null,
  'Formulaire de bilan : historique sportif, habitudes alimentaires, objectifs personnels.',
  2,
  15
),
(
  'c0000001-0001-0003-0000-000000000000',
  'b0000001-0000-0001-0000-000000000000',
  'Tests de condition physique initiale',
  'text',
  null,
  'Protocole de tests : estimation VO2max, test de force, souplesse et composition corporelle.',
  3,
  20
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- CONTENUS -- NZ Perte de Poids / Module 2 : Fondations du mouvement
-- ============================================================

INSERT INTO program_contents
  (id, module_id, title, content_type, content_url, description, position, duration_min)
VALUES
(
  'c0000001-0002-0001-0000-000000000000',
  'b0000001-0000-0002-0000-000000000000',
  'Les 5 patterns de mouvement fondamentaux',
  'video',
  null,
  'Squat, charniere, pousse, tire, gainage : la base de tout entrainement efficace.',
  1,
  12
),
(
  'c0000001-0002-0002-0000-000000000000',
  'b0000001-0000-0002-0000-000000000000',
  'Seance 1 - Activation et Mobilite',
  'video',
  null,
  'Premiere seance complete filmee. Echauffement, travail de mobilite, retour au calme.',
  2,
  35
),
(
  'c0000001-0002-0003-0000-000000000000',
  'b0000001-0000-0002-0000-000000000000',
  'Plan hebdomadaire S1-S2',
  'pdf',
  null,
  'Calendrier des seances semaines 1 et 2 avec intensites et durees.',
  3,
  5
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- CONTENUS -- NZ Remise en Forme / Module 1 : Evaluation de depart
-- ============================================================

INSERT INTO program_contents
  (id, module_id, title, content_type, content_url, description, position, duration_min)
VALUES
(
  'c0000002-0001-0001-0000-000000000000',
  'b0000002-0000-0001-0000-000000000000',
  'Bienvenue - Programme Remise en Forme',
  'video',
  null,
  'Presentation du programme 8 semaines et de la methode progressive NZ.',
  1,
  7
),
(
  'c0000002-0001-0002-0000-000000000000',
  'b0000002-0000-0001-0000-000000000000',
  'Questionnaire de depart',
  'pdf',
  null,
  'Evaluation du niveau actuel, historique de sante, objectifs et disponibilites.',
  2,
  10
),
(
  'c0000002-0001-0003-0000-000000000000',
  'b0000002-0000-0001-0000-000000000000',
  'Test de mobilite articulaire',
  'text',
  null,
  'Protocole pour evaluer la mobilite des hanches, epaules et colonne.',
  3,
  15
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- CONTENUS -- NZ Basket / Module 1 : Analyse du joueur
-- ============================================================

INSERT INTO program_contents
  (id, module_id, title, content_type, content_url, description, position, duration_min)
VALUES
(
  'c0000005-0001-0001-0000-000000000000',
  'b0000005-0000-0001-0000-000000000000',
  'Bienvenue - Coaching NZ Basket',
  'video',
  null,
  'Presentation de Mathieu, de la methode et du deroulement du coaching.',
  1,
  6
),
(
  'c0000005-0001-0002-0000-000000000000',
  'b0000005-0000-0001-0000-000000000000',
  'Fiche profil joueur',
  'pdf',
  null,
  'Evaluation : poste, niveau, forces/faiblesses, objectifs de saison.',
  2,
  10
),
(
  'c0000005-0001-0003-0000-000000000000',
  'b0000005-0000-0001-0000-000000000000',
  'Test physique basketball',
  'text',
  null,
  'Sprint 20m, saut vertical, agilite (T-test), endurance (yo-yo).',
  3,
  15
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- CONTENUS -- NZ Basket / Module 2 : Maniement de balle et Dribble
-- ============================================================

INSERT INTO program_contents
  (id, module_id, title, content_type, content_url, description, position, duration_min)
VALUES
(
  'c0000005-0002-0001-0000-000000000000',
  'b0000005-0000-0002-0000-000000000000',
  'Les fondamentaux du dribble',
  'video',
  null,
  'Prise en main du ballon, dribble basse main, dribble protection, crossover de base.',
  1,
  18
),
(
  'c0000005-0002-0002-0000-000000000000',
  'b0000005-0000-0002-0000-000000000000',
  'Exercices de maniement solo',
  'pdf',
  null,
  'Plan de 10 exercices quotidiens de 15 minutes pour progresser en dribble.',
  2,
  15
),
(
  'c0000005-0002-0003-0000-000000000000',
  'b0000005-0000-0002-0000-000000000000',
  'Analyse video dribble - exemples NBA',
  'video',
  null,
  'Decryptage de techniques de dribble avancees a partir d exemples de joueurs pro.',
  3,
  12
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- VALIDATION FINALE
-- Attendu apres execution complete :
--   programs_count  = 5
--   modules_count   = 35  (8+6+6+9+6)
--   contents_count  = 15  (3+3+3+3+3)
-- ============================================================

SELECT
  (SELECT count(*) FROM programs)         AS programs_count,
  (SELECT count(*) FROM program_modules)  AS modules_count,
  (SELECT count(*) FROM program_contents) AS contents_count;
