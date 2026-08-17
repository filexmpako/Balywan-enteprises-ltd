REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_owner(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_owner_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_owner(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated, service_role;