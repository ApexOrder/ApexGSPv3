create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  name text not null,
  slug text not null,
  game text not null default '7dtd',
  install_path text not null,
  executable_path text,
  status text not null default 'stopped' check (status in ('installing', 'stopped', 'starting', 'running', 'stopping', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (node_id, slug)
);

alter table public.servers enable row level security;

create policy "Users can read own servers"
  on public.servers
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own servers"
  on public.servers
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own servers"
  on public.servers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own servers"
  on public.servers
  for delete
  using (auth.uid() = user_id);

create index if not exists servers_user_id_idx on public.servers(user_id);
create index if not exists servers_node_id_idx on public.servers(node_id);
create index if not exists servers_status_idx on public.servers(status);
