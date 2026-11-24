# Kurekebisha: PETRO STEVEN haonekani kwenye orodha ya Owners

## Tatizo lililothibitishwa
- PETRO STEVEN yupo kwenye mfumo kama owner (Active, Masasi Mjini, ana login, wakala 323).
- Orodha ya Owners inaonyesha tu owners ambao "cheo" (title) chao kinatambulika kama Owner. Owners wengine wote wana cheo "MFS"; PETRO STEVEN ana cheo "BALWYN INVESTMENT MGT TILL 2" (jina la till liliwekwa kama cheo) — kwa hiyo anafichwa.
- Pia leo (24 Nov, 10:25) kuliongezwa rekodi mpya ya mfanyakazi "PETRO" (cheo Owner, Masasi Town, till 255675121969) bila kuunganishwa na owner yeyote — ni nakala ya pili isiyohitajika.

## Marekebisho
1. Badilisha cheo cha PETRO STEVEN kuwa "MFS" kama owners wengine — ataonekana mara moja.
2. Rekebisha mfumo: rekodi yoyote iliyo kwenye jedwali la owners ionekane kwenye orodha ya Owners kila mara, bila kutegemea cheo, ili tatizo hili lisijirudie.
3. Futa rekodi ya mfanyakazi "PETRO" iliyoongezwa leo (haina login, haina owner, till yake tayari ni ya PETRO STEVEN).
4. Kuhakiki: kufungua orodha ya Owners kama admin na kuona owners 11 pamoja na PETRO STEVEN.

## Technical details
- Data: UPDATE owners SET title='MFS' WHERE owner_id='owner-1792082316650'; DELETE FROM personnel WHERE personnel_id='personnel-1795505148960-a37'.
- Code: in PeopleManagementView.tsx `mappedOwners`, return all `owners` (title mapping applies only to personnel); remove the now-unused role lookup for owners.
