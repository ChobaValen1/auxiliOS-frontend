-- Re-evaluate only pending receipts. Approved and paid receipts stay frozen.
-- With no monthly amount entered, the guard records a pending cash snapshot
-- and sets the cash deduction to zero.
update public.payroll_liquidaciones
set created_at = created_at
where estado = 'pendiente';
