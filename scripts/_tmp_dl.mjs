import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://ukpuhoynrqobqtzdbysp.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcHVob3lucnFvYnF0emRieXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjg0MjAsImV4cCI6MjA4OTUwNDQyMH0._6akoDAYdlXfU6033rTNd1U1c2tXyzLll7oTHDG7IfM");
const f = process.argv[2];
const { data, error } = await sb.storage.from("database-backups").createSignedUrl(f, 600);
if (error) { console.error(error); process.exit(1); }
console.log(data.signedUrl);
