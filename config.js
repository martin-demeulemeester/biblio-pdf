/*
  ╔══════════════════════════════════════════════════════════════╗
  ║  CONFIGURATION — à remplir avant de déployer sur Netlify     ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║  1. Créez un compte gratuit sur https://supabase.com         ║
  ║  2. Créez un nouveau projet                                  ║
  ║  3. Allez dans Settings → API → copiez vos clés              ║
  ║  4. Dans Storage → créez un bucket "pdfs" (cochez Public)    ║
  ║  5. Dans SQL Editor → exécutez le SQL ci-dessous             ║
  ║                                                              ║
  ╠══════════════════════════════════════════════════════════════╣
  ║  SQL À EXÉCUTER DANS SUPABASE                                ║
  ╠══════════════════════════════════════════════════════════════╣

  create table pdfs (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    description text,
    category text default 'General',
    file_url text not null,
    file_name text,
    file_size text,
    pages integer default 0,
    created_at timestamptz default now()
  );

  create table downloads (
    id uuid default gen_random_uuid() primary key,
    pdf_id uuid references pdfs(id) on delete cascade,
    user_pseudo text not null default 'Anonyme',
    downloaded_at timestamptz default now()
  );

  create table ratings (
    id uuid default gen_random_uuid() primary key,
    pdf_id uuid references pdfs(id) on delete cascade,
    user_pseudo text not null,
    score integer check (score between 1 and 5),
    created_at timestamptz default now(),
    unique(pdf_id, user_pseudo)
  );

  alter table pdfs      enable row level security;
  alter table downloads enable row level security;
  alter table ratings   enable row level security;

  create policy "lecture publique"     on pdfs      for select using (true);
  create policy "lecture publique"     on downloads for select using (true);
  create policy "lecture publique"     on ratings   for select using (true);
  create policy "insertion publique"   on downloads for insert with check (true);
  create policy "insertion notes"      on ratings   for insert with check (true);
  create policy "mise a jour notes"    on ratings   for update using (true);
  create policy "admin insert pdfs"    on pdfs      for insert with check (true);
  create policy "admin delete pdfs"    on pdfs      for delete using (true);
  create policy "admin update pdfs"    on pdfs      for update using (true);

  ╚══════════════════════════════════════════════════════════════╝
*/

const SUPABASE_URL  = 'https://ifrbpnxppwruugzuwyhu.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_HJFXUYQCGKCH2H_jaGGsYA_onfeIpxG';
