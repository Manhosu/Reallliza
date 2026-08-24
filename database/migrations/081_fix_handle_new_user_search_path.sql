-- Corrige handle_new_user(): sem SET search_path, a referência a
-- "user_role" (sem qualificar public.) falhava dependendo do search_path
-- de quem disparava o INSERT em auth.users -- descoberto testando o
-- autocadastro de empresa (migration 080): a conta em auth.users era
-- criada, mas o profile correspondente nunca nascia, e tudo que dependia
-- dele (inclusive /cadastro-profissional, que já existia) quebrava
-- silenciosamente, porque o EXCEPTION WHEN OTHERS só loga e segue.
--
-- SET search_path = public também é boa prática de segurança padrão pra
-- função SECURITY DEFINER (evita depender do search_path de quem chama).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'technician')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
