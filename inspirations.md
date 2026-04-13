# Neurofolk — AI inspirations

Reference document — proven AI/simulation design patterns we can borrow from for
hand-coded autorskie mechanics. We're sticking with **utility AI** as the core
decision system; this catalog covers extensions and adjacent ideas worth raiding.

---

## Główne paradygmaty decyzyjne

| Paradygmat | Co to | Kto używa | Czy do nas |
|---|---|---|---|
| **Finite State Machine** | Stany + przejścia (idle→hunt→eat) | stare gry | proste, słabo skaluje przy wielu decyzjach |
| **Behavior Tree** | Drzewo nodów (selector, sequence) | Halo, większość AAA | dobre dla "scripted", gorsze dla emergentnych |
| **Utility AI** ← my | Score per akcja, najwyższy wygrywa | The Sims, **RimWorld**, Caves of Qud | **idealne dla naszego typu gry** |
| **GOAP** | Cel → planner znajduje sekwencję akcji | F.E.A.R. | overkill dla naszej skali |
| **HTN** | Hierarchiczne zadania | Killzone, Horizon | overkill |

**Decyzja:** utility AI zostaje kręgosłupem. Pozostałe paradygmaty to wiedza w tle.

---

## Mechaniki do podkradania

### 1. Memory / Belief system
*The Sims, Dwarf Fortress*

Entity pamięta gdzie ostatnio widział zasób. Nawet jeśli `nearestAnimal` jest
undefined w danym ticku (poza zasięgiem wzroku), entity **wie** że "wczoraj było
stado tam" i tam idzie.

**Aktualnie:** hunter widzi zwierzę → idzie. Traci z oczu → goal się zeruje.
**Z memory:** kontynuuje na ostatnią widzianą pozycję, po przybyciu szuka dalej.

Realniejsze, mniej "amnezji ticka". Można też mieć **wrong beliefs** — entity
myśli że stockpile ma jedzenie bo wczoraj było, ale dziś nie. Głębia.

### 2. Steering behaviors / Boids
*Reynolds, klasyk*

Trzy reguły dają **emergent flocking**:
- **Separation** — odsuń się od najbliższych sąsiadów
- **Alignment** — leć w kierunku średnim sąsiadów
- **Cohesion** — leć w stronę środka grupy

Plus **flee** = wektor sił od zagrożenia.

To **dokładnie** to co robimy ręcznie dla stad zwierząt (centroid + leash + flee).
Boids zastąpiłyby cały ten kod jednym czystym matematycznym systemem.

### 3. Need stack
*The Sims classic*

Zamiast jednego `energy`, entity ma listę potrzeb: `hunger`, `rest`, `social`,
`comfort`, `hygiene`. Każda spada w czasie, akcja wybierana = zaspokajająca
najbardziej deficytową.

To jest **nadbudowa nad utility AI** — każda potrzeba = nowy `score*` w utility.

**Co dodać:**
- **Rest** — entity męczy się, musi spać
- **Social** — chce być blisko innych (samotność szkodzi)
- **Ambition** — niektórzy chcą iść na łowy nawet jak nie głodni

### 4. Skill progression
*RimWorld, Project Zomboid*

Każda akcja inkrementuje skill. Wyższy skill = szybsza akcja, lepsze produkty.

**Aktualnie:** training daje +0.3 strength.
**Można rozszerzyć:**
- Każdy `chop` += chopping skill → szybciej rąbie + większy yield
- Każdy `cook` += cooking skill → lepsza jakość cooked food (więcej energy/portion)
- Każdy `hunt` += hunting skill → większa szansa, lepsza zwierzyna

Naturalnie wyłaniają się **specjaliści** w plemieniu.

### 5. Job queue
*Banished, Dwarf Fortress, Settlers*

Wioska ma **listę zadań** ("budowa domu pod (5,5)", "polowanie wymagane",
"transport drewna na (8,8)"). Entities **biorą z kolejki** najbliższe matching ich
roli.

**Aktualnie:** każdy decyduje sam co robić. Czasem N mężczyzn wybiera ten sam las.
**Z queue:** pierwszy bierze, pozostali widzą "zajęte" i wybierają inne.

Większy refaktor.

### 6. Reputation / opinions
*Crusader Kings, Sims*

Entity śledzi swoje opinie o innych: "lubię Mariana bo mi pomógł", "boję się
Karola bo widziałem jak zabija". Wpływa na:
- Wybór partnera
- Czy zaatakować
- Czy współpracować przy budowie

**Aktualnie:** walki tribu vs tribe to losowość po `aggression`.
**Z reputacją:** konkretny mężczyzna pamięta że ten drugi wczoraj zabił mu brata
→ wyższa szansa na walkę.

### 7. Mood / morale
*RimWorld, Bannerlord*

Wewnętrzny stan psychiczny. Wpływany przez wydarzenia:
- Świadek śmierci → mood -10
- Narodziny w wiosce → mood +5
- Głód + brak domu → mood -20

Niski mood → entity przestaje pracować, "łamie się", może uciec.

To **głębia symulacji** którą RimWorld się sprzedał.

### 8. Family bonds / lineage
*Crusader Kings, Dwarf Fortress*

Każde dziecko zna matkę (już to mamy), brata/siostrę (twins), ojca. Bonds wpływają:
- Rodzeństwo broni siebie nawzajem
- Dziecko bliżej matki nawet po dorosłości
- Dziadkowie pomagają wnukom (passive boost)

**Aktualnie:** mamy `motherId`. Można rozszerzyć na `fatherId`, `siblings: string[]`.

### 9. Reactive emotions
*Sims 4, RimWorld*

Entity ma stany typu: szczęśliwy, smutny, wściekły. Stany trwają X ticków,
wpływają na decyzje:
- Smutny → mniej pracuje, więcej "play"
- Wściekły → wyższa szansa na fight
- Szczęśliwy → bonus do reprodukcji

### 10. Influence maps / heatmaps
*StarCraft, RTS*

Globalna grid wartości — każde pole ma "influence" zasobów (jedzenia), zagrożeń
(zwierzę agresywne), domów. Entity sprawdza gradient i porusza się w stronę mu
wygodną.

**Eleganckie zastąpienie dla wielu rzeczy:**
- Pathfinding "do najbliższej trawy" → idź po gradiencie food influence
- Flee od ludzi → idź anti-gradient threat influence
- Drift do village → gradient comfort influence

Implementacja = aktualizacja gridu co tick.

---

## Ranking — co podkradać NAJPIERW

Od **highest value / lowest effort:**

1. **Memory dla hunter→animal** — łatwe, fixuje "amnezję ticka"
2. **Need stack expansion** — dodaj `rest`, `social` jako dodatkowe scores. Naturalnie wzmacnia ekonomię
3. **Skill progression** — proste do dodania, daje **specialization** plemienia bez konfiguracji
4. **Boids dla zwierząt** — clean refactor obecnego ad-hoc "centroid + leash" w spójną teorię
5. **Mood / morale** — średni effort, **bardzo duża głębia gameplay**

## Co odłożyć

- **GOAP/HTN** — overkill dla naszej skali
- **Reputation** — wymaga family/social tracking, najpierw potrzebujemy memory
- **Influence maps** — eleganckie, ale wymaga refaktoru pathfindingu
- **Job queue** — duży refaktor, nieoczywisty zysk

---

## Źródła do nauki

### Książki
- *Game AI Pro* (3 tomy, free online) — kompendium technik z industrii
- *AI for Games* — Ian Millington, klasyk
- *Programming Game AI by Example* — Mat Buckland, dobre na boids/steering

### Postmortemy / talks
- **RimWorld** — Tynan Sylvester wiele pisał o emergent AI
- **Dwarf Fortress** — Tarn Adams devblogi
- **Caves of Qud** — Brian Bucklew GDC talk *"AI Postmortem: Caves of Qud"*
- **Project Zomboid** — devblogi mają sporo o needs/mood
- **The Sims** — Will Wright DevSpeak (stary ale złoty)

### Konkretne wpisy
- *"An Architecture for Character-Rich Social Simulation"* (RimWorld dev)
- *"Sims-style AI Through Utility Theory"* (GDC)
- *"The Behavior of Behaviors"* (Halo dev, classic on BTs)

---

## Notatka o filozofii

Każda mechanika powyżej to **wzorzec projektowy**, nie biblioteka. Implementujemy
ręcznie pod nasz silnik (utility AI + Activity system). Cel: **głębia symulacji
przez wiele małych systemów które wchodzą w interakcje**, nie jedno wielkie
narzędzie.

To ścieżka *RimWorld / Dwarf Fortress* — a nie *Unity Asset Store*.
