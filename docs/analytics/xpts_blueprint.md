# FPL Predicted Points (xPts) Blueprint

Below is a plug‑and‑play blueprint you can drop into your FPL analytics platform to produce Predicted Points (xPts) for the next Gameweek. It’s designed to:

- blend recent form with season data
- adjust for home/away and fixture difficulty using Understat team metrics
- model “nailedness” (minutes)
- separate logic for Attackers vs DEF/GK
- include an explosiveness module to surface differential captaincy picks

---

## 0) Notation & constants (per GW and per player _i_ vs opponent team _O_)

### League averages (recompute weekly)

- \(\overline{\text{xG}}, \overline{\text{xGA}}, \overline{\text{Deep}}, \overline{\text{PPDA}}\)

### Player per‑90 metrics (Understat)

Season per‑90 (and same for last 5 matches):

- \(\text{xG90}\_i, \text{xA90}\_i, \text{Shots90}\_i, \text{KP90}\_i\)
- \(\text{xG90}\_i^{(5)}, \text{xA90}\_i^{(5)}, \dots\) for last 5

### Team per‑90 metrics (Understat)

Player’s team \(T\):

- \(\text{xG90}\_T, \text{xGA90}\_T, \text{DeepAllowed}\_T, \text{PPDA}\_T\) (season & last 5)

Opponent team \(O\):

- \(\text{xG90}\_O, \text{xGA90}\_O, \text{DeepAllowed}\_O, \text{PPDA}\_O\) (season & last 5)

### FPL scoring constants

- Goals:
  - FWD: 4 pts
  - MID: 5 pts
  - DEF/GK: 6 pts
- Assists: 3 pts
- Clean sheet:
  - MID: 1 pt
  - DEF/GK: 4 pts
- Appearance:
  - \(\ge 60'\): 2 pts
  - \< 60': 1 pt
- Goals conceded penalty (DEF/GK): −1 per 2 conceded
- GK saves: +1 per 3 saves

---

## 1) Recent‑vs‑Season blend with sample‑size shrinkage

For any per‑90 metric \(m\) (e.g. xG90, xA90, Shots90, …):

Define minutes in last 5 matches as \(\text{Min}\_i^{(5)}\).  
Form weight:

\[
w_i^{(5)} = \min\left(1, \frac{\text{Min}\_i^{(5)}}{180}\right)
\]

Blend parameter:

- Attackers (FWD/MID): \(\alpha = 0.60\)
- DEF/GK: \(\alpha = 0.50\)

Blended metric:

\[
m_i^\* = (\alpha \, w_i^{(5)}) \, m_i^{(5)} + (1 - \alpha \, w_i^{(5)}) \, m_i^{(\text{season})}
\]

Use the same construction for team metrics \(\text{xG90}\_T^\*, \text{xGA90}\_T^\*\) etc., with team‑level \(\alpha_T = 0.55\).

---

## 2) Home/Away multipliers (league‑level priors)

Attack multiplier:

- \(H\_{\text{att}} = 1.08\) if home
- \(H\_{\text{att}} = 0.92\) if away

Defense multiplier (expected goals conceded):

- \(H\_{\text{def}} = 0.92\) if home
- \(H\_{\text{def}} = 1.08\) if away

---

## 3) Fixture difficulty (opponent defensive profile)

Define opponent ratios to league averages:

\[
R*{\text{xGA},O} = \frac{\text{xGA90}\_O^\*}{\overline{\text{xGA}}}, \quad
R*{\text{Deep},O} = \frac{\text{DeepAllowed}_O^\*}{\overline{\text{Deep}}}, \quad
R_{\text{PPDA},O} = \frac{\text{PPDA}\_O^\*}{\overline{\text{PPDA}}}
\]

### Attacking chance creation factor (for xG)

\[
F*O(\text{xG}) = R*{\text{xGA},O}^{0.65} \cdot R\_{\text{Deep},O}^{0.35}
\]

### Creative factor (for xA)

\[
F*O(\text{xA}) = R*{\text{xGA},O}^{0.50} \cdot R*{\text{Deep},O}^{0.40} \cdot R*{\text{PPDA},O}^{0.20}
\]

---

## 4) Minutes / “Nailedness” model

Let:

- \(p_i^{\text{start}}\): probability the player starts
- \(p_i^{\text{cam}}\): cameo probability conditional on not starting (default 0.35 if unknown)
- Mean minutes if starts by position:
  - FWD: 79, MID: 78, DEF: 85, GK: 90
- Probability of \(\ge 60'\) **given** a start:
  - FWD/MID: 0.82, DEF: 0.88, GK: 0.99
- Cameo mean minutes: \(\mu\_{\text{cam}} = 20\)

Then:

\[
p_i^{\text{app}} = p_i^{\text{start}} + (1 - p_i^{\text{start}}) \, p_i^{\text{cam}}
\]

\[
P60*i = p_i^{\text{start}} \cdot p*{\text{pos},60 \mid \text{start}}
\]

\[
\mathbb{E}[\text{min}]_i = p_i^{\text{start}} \, \mu_{\text{pos,start}}

- (1 - p*i^{\text{start}}) \, p_i^{\text{cam}} \, \mu*{\text{cam}}
  \]

\[
M_i = \frac{\mathbb{E}[\text{min}]\_i}{90}
\]

Use \(P60_i\) for appearance/clean‑sheet eligibility; use \(M_i\) to scale per‑90 attacking returns.

---

## 5) Opponent‑adjusted team expectations for the fixture

### Team attacking environment

\[
\lambda^{\text{att}}_{T \to O} = \text{xG90}\_T^\* \cdot H_{\text{att}} \cdot F_O(\text{xG})
\]

### Team defensive environment (expected xG against your team)

\[
\lambda^{\text{def}}_{O \to T} =
\text{xG90}\_O^\* \cdot H_{\text{def}}
\cdot \left(\frac{\text{xGA90}\_T^\*}{\overline{\text{xGA}}}\right)^{0.70}
\cdot \left(\frac{\text{DeepAllowed}\_T^\*}{\overline{\text{Deep}}}\right)^{0.30}
\]

### Clean‑sheet probability (Poisson goal model)

\[
P*T^{\text{CS}} = \exp\left(-\lambda^{\text{def}}*{O \to T}\right)
\]

---

## 6) Player involvement shares

Let team attacking baseline be \(\text{xG90}\_T^\*\). Define:

\[
gShare_i = \text{clip}\left(\frac{\text{xG90}\_i^\*}{\text{xG90}\_T^\* + \varepsilon}, 0.03, 0.65\right)
\]

\[
aShare_i = \text{clip}\left(\frac{\text{xA90}\_i^\*}{\text{xG90}\_T^\* + \varepsilon}, 0.03, 0.65\right)
\]

---

## 7) Player‑level expected event counts for the match

\[
\hat{\text{xG}}_i = M_i \cdot \lambda^{\text{att}}_{T \to O} \cdot gShare_i
\]

\[
\hat{\text{xA}}_i = M_i \cdot \lambda^{\text{att}}_{T \to O} \cdot aShare*i \cdot R*{\text{PPDA},O}^{0.20}
\]

---

## 8) Appearance & auxiliary components

### Appearance points

\[
\mathbb{E}[\text{AppPts}]\_i = 2 \cdot P60_i + 1 \cdot (p_i^{\text{app}} - P60_i)
\]

### Midfielder clean‑sheet point

\[
\mathbb{E}[\text{CS\_MID}]_i =
\mathbf{1}_{\text{pos} = \text{MID}} \cdot P_T^{\text{CS}} \cdot P60_i
\]

### DEF/GK clean‑sheet points

\[
\mathbb{E}[\text{CS\_DEF/GK}]_i =
\mathbf{1}_{\text{pos} \in \{\text{DEF}, \text{GK}\}}
\cdot 4 \cdot P_T^{\text{CS}} \cdot P60_i
\]

### Goals conceded penalty (DEF/GK)

Let \(X \sim \text{Poisson}(\lambda^{\text{def}}\_{O \to T})\) be goals conceded.  
FPL subtracts 1 pt per 2 conceded. Use the expected value of \(\lfloor X/2 \rfloor\) (exact Poisson formula in the original derivation) and scale by \(P60_i\):

\[
\mathbb{E}[\text{GC\_penalty}]_i
= \mathbf{1}_{\text{pos} \in \{\text{DEF}, \text{GK}\}} \cdot (-\mathbb{E}[\lfloor X/2 \rfloor]) \cdot P60_i
\]

### GK saves (rough but effective)

Empirically: \(\text{Saves} \approx 2.1 \times \lambda^{\text{def}}\_{O \to T}\).  
Points are \(\lfloor \text{Saves}/3 \rfloor\). Approximate expectation:

\[
\mathbb{E}[\text{SavePts}]_{\text{GK}}
\approx
\mathbf{1}_{\text{pos} = \text{GK}}
\cdot 0.9 \cdot \frac{2.1 \, \lambda^{\text{def}}\_{O \to T}}{3} \cdot P60_i
\]

### Cards & red cards (optional)

If you track per‑90 rates \(\text{Y90}\_i, \text{R90}\_i\):

\[
\mathbb{E}[\text{CardPts}]\_i \approx -1 \cdot \text{Y90}\_i \cdot M_i - 3 \cdot \text{R90}\_i \cdot M_i
\]

### Bonus points (parsimonious proxy)

Keep small; calibrated to give ~0–1.2 on average.

- FWD/MID:

\[
\mathbb{E}[\text{Bonus}]\_i =
0.28 \, \hat{\text{xG}}\_i + 0.20 \, \hat{\text{xA}}\_i + 0.10 \, P_T^{\text{CS}}
\]

- DEF:

\[
\mathbb{E}[\text{Bonus}]\_i =
0.70 \, P_T^{\text{CS}}

- 0.15(\hat{\text{xG}}\_i + 0.7 \, \hat{\text{xA}}\_i)
  \]

* GK:

\[
\mathbb{E}[\text{Bonus}]\_i =
0.50 \, P_T^{\text{CS}}

- 0.15 \, \mathbb{E}[\text{SavePts}]\_{\text{GK}}
- 0.15(\hat{\text{xG}}\_i + 0.7 \, \hat{\text{xA}}\_i)
  \]

(These coefficients are starting priors; re‑fit on your data each season.)

---

## 9) Predicted Points formulas

### 9.1 Attackers (FWD/MID)

Let:

- \(G\_{\text{pts}} = 4\) for FWD
- \(G\_{\text{pts}} = 5\) for MID

Then:

\[
\text{xPts}\_i^{\text{ATT}} =
\mathbb{E}[\text{AppPts}]\_i

- G\_{\text{pts}} \cdot \hat{\text{xG}}\_i
- 3 \cdot \hat{\text{xA}}\_i
- \mathbb{E}[\text{CS\_MID}]\_i
- \mathbb{E}[\text{Bonus}]\_i
- \mathbb{E}[\text{CardPts}]\_i
  \]

### 9.2 DEF/GK

\[
\text{xPts}\_i^{\text{DEF/GK}} =
\mathbb{E}[\text{AppPts}]\_i

- 6 \cdot \hat{\text{xG}}\_i
- 3 \cdot \hat{\text{xA}}\_i
- \mathbb{E}[\text{CS\_DEF/GK}]\_i
- \mathbb{E}[\text{GC\_penalty}]\_i
- \mathbf{1}_{\text{pos} = \text{GK}} \cdot \mathbb{E}[\text{SavePts}]_{\text{GK}}
- \mathbb{E}[\text{Bonus}]\_i
- \mathbb{E}[\text{CardPts}]\_i
  \]

Double/Blank GWs: sum the fixture‑level \(\text{xPts}\) across all matches in the GW (recompute all factors per opponent).

---

## 10) Explosiveness & differential captaincy

Goal: surface players with high ceiling (right‑tail) rather than just high mean.

### 10.1 Fast Monte Carlo (recommended)

For each player \(i\) (e.g. 10k draws):

```python
for s in range(N):
    start = Bernoulli(p_start_i)
    cameo = Bernoulli(p_cam_i) if not start else 0

    if start:
        mins = mu_start_pos
    elif cameo:
        mins = mu_cam
    else:
        mins = 0

    mfac = mins / 90.0

    lam_g = (lam_att_T_to_O * gShare_i) * mfac
    lam_a = (lam_att_T_to_O * aShare_i * R_PPDA_O**0.20) * mfac

    # Overdispersion via NegBin
    k_g = max(0.6, Shots90_i * mfac)
    k_a = max(0.6, KP90_i * mfac)

    goals   = NegBin(mean=lam_g, k=k_g)
    assists = NegBin(mean=lam_a, k=k_a)

    cs      = Bernoulli(exp(-lam_def_O_to_T) * (mins >= 60))
    gc      = Poisson(lam_def_O_to_T) * (mins >= 60)
    saves   = Poisson(2.1 * lam_def_O_to_T) if pos == 'GK' and mins >= 60 else 0

    points_s = FPL_scoring(goals, assists, cs, gc, saves, mins, pos) \
               + bonus_proxy + card_proxy
```

Collect:

- Mean = predicted xPts
- P90 (90th percentile), P75
- Boom rate = \(P(\text{points} \ge 12)\)

Example captaincy score:

\[
C_i = 0.6 \cdot \mathbb{E}[\text{Pts}] + 0.4 \cdot P90
\]

Rank captaincy differentials by high \(C_i\) and low EO (effective ownership).

### 10.2 Quick analytic variance (if you skip simulation)

For Poisson/NegBin mixture:

\[
\text{Var}(\text{Goals}\_i) \approx \hat{\text{xG}}\_i \left(1 + \frac{\hat{\text{xG}}\_i}{k_g}\right),
\quad k_g \approx \max(0.6, \text{Shots90}\_i \cdot M_i)
\]

Same for assists using \(\text{KP90}\_i\). Larger \(\hat{\text{xG}}\_i / k_g\) ⇒ more explosive.

---

## 11) Suggested default coefficients (tune with CV on your data)

Abridged table of sensible starting values:

- Recent blend \(\alpha\) (ATT / DEF-GK): 0.60 / 0.50
- Recent weight shrink \(w^{(5)} \sim \text{Min}^{(5)} / 180\) (cap at 1)
- Home/Away attack \(H\_{\text{att}}\): 1.08 (H), 0.92 (A)
- Home/Away defense \(H\_{\text{def}}\): 0.92 (H), 1.08 (A)
- Opponent factors on xG: \(R*{\text{xGA},O}^{0.65} \cdot R*{\text{Deep},O}^{0.35}\)
- Opponent factors on xA: \(R*{\text{xGA},O}^{0.50} \cdot R*{\text{Deep},O}^{0.40} \cdot R\_{\text{PPDA},O}^{0.20}\)
- Minutes if start: FWD 79, MID 78, DEF 85, GK 90
- \(p\_{60 \mid \text{start}}\): FWD/MID 0.82, DEF 0.88, GK 0.99
- Cameo \(p*{\text{cam}}\), \(\mu*{\text{cam}}\): 0.35, 20'
- GK saves \(\approx 2.1 \cdot \lambda^{\text{def}}\_{O \to T}\)
- Bonus formulas as in section 8

Tip: Re‑estimate exponents/weights by minimizing RMSE on past GWs (out‑of‑sample cross‑validation), optionally with Bayesian ridge or gradient boosting on top of these engineered features.

---

## 12) Production pseudocode (vectorizable)

```python
# Inputs: player df P, team df T (season+last5 per90), league averages L
# For each fixture (player i, team T, opponent O, home_flag):

for i in players:
    # --- blend per90 with shrinkage ---
    w5 = min(1.0, P[i].mins_last5 / 180.0)
    alpha = 0.60 if P[i].pos in {'FWD','MID'} else 0.50

    xG90_i  = alpha*w5*P[i].xG90_last5 + (1-alpha*w5)*P[i].xG90_season
    xA90_i  = alpha*w5*P[i].xA90_last5 + (1-alpha*w5)*P[i].xA90_season
    Shots90 = alpha*w5*P[i].Shots90_last5 + (1-alpha*w5)*P[i].Shots90_season
    KP90    = alpha*w5*P[i].KP90_last5    + (1-alpha*w5)*P[i].KP90_season

    # team blends (implement similarly)
    xG90_T  = blend_team_xG(T[P[i].team_id])
    xGA90_T = blend_team_xGA(T[P[i].team_id])
    xG90_O  = blend_team_xG(T[P[i].opp_id])
    xGA90_O = blend_team_xGA(T[P[i].opp_id])
    Deep_O  = blend_team_deep(T[P[i].opp_id])
    PPDA_O  = blend_team_ppda(T[P[i].opp_id])
    Deep_T  = blend_team_deep(T[P[i].team_id])

    # --- home/away ---
    H_att = 1.08 if P[i].home_flag else 0.92
    H_def = 0.92 if P[i].home_flag else 1.08

    # --- opponent factors ---
    FxG = (xGA90_O / L.xGA)**0.65 * (Deep_O / L.deep)**0.35
    FxA = (xGA90_O / L.xGA)**0.50 * (Deep_O / L.deep)**0.40 * (PPDA_O / L.ppda)**0.20

    # --- minutes / eligibility ---
    p_start = estimate_start_prob(P[i])
    p_cam   = estimate_cameo_prob(P[i])  # default 0.35 if unknown

    mu_start = {'FWD':79,'MID':78,'DEF':85,'GK':90}[P[i].pos]
    p60_if_start = {'FWD':0.82,'MID':0.82,'DEF':0.88,'GK':0.99}[P[i].pos]

    Papp = p_start + (1 - p_start)*p_cam
    P60  = p_start * p60_if_start
    Emins = p_start*mu_start + (1-p_start)*p_cam*20
    Mfac  = Emins / 90.0

    # --- team lambdas ---
    lam_att = xG90_T * H_att * FxG
    lam_def = xG90_O * H_def * (xGA90_T / L.xGA)**0.70 * (Deep_T / L.deep)**0.30
    Pcs     = np.exp(-lam_def)

    # --- player shares & expected events ---
    gShare = clip(xG90_i / (xG90_T + 1e-6), 0.03, 0.65)
    aShare = clip(xA90_i / (xG90_T + 1e-6), 0.03, 0.65)

    xG_hat = Mfac * lam_att * gShare
    xA_hat = Mfac * lam_att * aShare * (PPDA_O / L.ppda)**0.20

    # --- components ---
    AppPts = 2*P60 + 1*(Papp - P60)
    CS_mid = Pcs*P60 if P[i].pos == 'MID' else 0
    CS_def = 4*Pcs*P60 if P[i].pos in {'DEF','GK'} else 0

    GC_pen = 0
    if P[i].pos in {'DEF','GK'}:
        # use exact Poisson expectation or simple approx
        GC_pen = - expected_gc_penalty(lam_def) * P60

    SavePts = 0
    if P[i].pos == 'GK':
        SavePts = 0.9*(2.1*lam_def)/3.0 * P60

    Bonus = bonus_proxy(P[i].pos, xG_hat, xA_hat, Pcs, SavePts)
    Cards = card_penalty_proxy(P[i])  # optional

    goal_pts = 4 if P[i].pos == 'FWD' else (5 if P[i].pos == 'MID' else 6)

    xPts = (AppPts
            + goal_pts * xG_hat
            + 3 * xA_hat
            + CS_mid + CS_def + GC_pen + SavePts
            + Bonus + Cards)
```

---

## 13) Practical notes & extensions

- **Set pieces / penalties**: add a penalty bump to \(\hat{\text{xG}}\_i\) if on pens.
- **Multiple fixtures (DGW)**: compute fixture‑level xPts then sum.
- **Calibration**: refit
  - home/away multipliers
  - opponent exponents (0.65/0.35 etc.)
  - bonus proxies  
    using past 1–2 seasons with rolling re‑calibration.

- **Boundaries**: clip probabilities to \([0,1]\), rates \(\ge 0\), shares \([0.03, 0.65]\).

### What you get out‑of‑the‑box

- **Attackers (FWD/MID)**: xPts driven by opponent xGA, deep entries, PPDA (for creators), recent form, and starting odds.
- **DEF/GK**: xPts driven by CS probability via Poisson on \(\lambda^{\text{def}}\), GC penalty expectation, GK save points, plus small attacking contribution.
- **Explosiveness**: via Monte Carlo or NegBin variance, yielding P90, boom rate, and a captaincy score that elevates differentials with real ceilings.
