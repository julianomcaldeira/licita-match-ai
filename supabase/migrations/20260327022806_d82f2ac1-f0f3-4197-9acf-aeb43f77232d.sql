-- Allow admin_central to update user roles
CREATE POLICY "Admin central can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin_central'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin_central'::app_role));

-- Allow admin_central to update profiles (e.g. display_name)
CREATE POLICY "Admin central can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin_central'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin_central'::app_role));