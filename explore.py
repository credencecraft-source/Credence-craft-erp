import re

with open("master-diff.sql", "r", encoding="utf-8") as f:
    text = f.read()

# Let's split by semicolons but be smart about it, or split by -- Comments and group statements.
# Usually, comments look like "-- CreateTable" or "-- CreateIndex" or "-- AddForeignKey".
# Let's see if we can find all statements.
# Actually, standard SQL statements end with a semicolon.
# Since we have standard Prisma SQL output, splitting by ";" is very robust if we handle whitespace.

raw_stmt = text.split(";")
print(f"Number of statements: {len(raw_stmt)}")

create_tables = []
create_indexes = []
alter_tables = []
other = []

for s in raw_stmt:
    s_clean = s.strip()
    if not s_clean:
        continue
    
    if "CREATE TABLE" in s_clean:
        create_tables.append(s_clean)
    elif "CREATE INDEX" in s_clean or "CREATE UNIQUE INDEX" in s_clean:
        create_indexes.append(s_clean)
    elif "ALTER TABLE" in s_clean:
        alter_tables.append(s_clean)
    else:
        other.append(s_clean)

print(f"Create Tables: {len(create_tables)}")
print(f"Create Indexes: {len(create_indexes)}")
print(f"Alter Tables: {len(alter_tables)}")
print(f"Other: {len(other)}")

for t in create_tables[:5]:
    print("--- TABLE ---")
    print(t[:200])

for idx in create_indexes[:5]:
    print("--- INDEX ---")
    print(idx[:200])

for alt in alter_tables[:5]:
    print("--- ALTER ---")
    print(alt[:200])

for ot in other[:5]:
    print("--- OTHER ---")
    print(ot[:200])
