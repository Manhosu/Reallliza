-- Jéssica testou o item Cursos/Biblioteca Técnica e reportou que faltavam
-- tipos de aula "Imagem" e "Anexos/arquivos" além de vídeo/texto/pdf/quiz —
-- confirmado como parte do Módulo de Cursos fechado com o Ricardo, não
-- lacuna de implementação.

ALTER TYPE public.lesson_type ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE public.lesson_type ADD VALUE IF NOT EXISTS 'attachment';

ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;
