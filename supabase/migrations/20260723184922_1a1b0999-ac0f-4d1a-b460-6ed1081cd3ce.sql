-- Allow authenticated users to insert their own usage events
CREATE POLICY "uso_eventos self insert"
ON public.uso_eventos
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());