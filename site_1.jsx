import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import emailjs from "@emailjs/browser";

// ─── Data ────────────────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: "glp3rt-5",
    name: "GLP-3RT",
    dose: "5 mg",
    price: 55,
    bulk: 50,
    image: "/glp3rt-5.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glp3rt-10",
    name: "GLP-3RT",
    dose: "10 mg",
    price: 85,
    bulk: 80,
    image: "/glp3rt-10.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glp3rt-20",
    name: "GLP-3RT",
    dose: "20 mg",
    price: 140,
    bulk: 130,
    image: "/glp3rt-20.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glp3rt-30",
    name: "GLP-3RT",
    dose: "30 mg",
    price: 185,
    bulk: 165,
    image: "/glp3rt-30.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "tesamorelin",
    name: "Tesamorelin",
    dose: "10 mg",
    price: 75,
    bulk: 70,
    image: "/tesamorelin.jpg",
    category: "Growth Hormone",
    research: "Tesamorelin is a synthetic analog of growth hormone-releasing hormone (GHRH). Research indicates it stimulates the pituitary gland to produce growth hormone in a pulsatile, physiological manner. Published studies have examined its effects on visceral adipose tissue reduction and lipid metabolism. It has been the subject of clinical research for its impact on body composition in various metabolic conditions.",
    sequence: "Modified GHRH (1-44) amide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 3 weeks.",
    purity: "99%+",
  },
  {
    id: "cjc-ipa",
    name: "CJC-1295 / Ipamorelin",
    dose: "5/5 mg",
    price: 75,
    bulk: 65,
    image: "/cjc-ipa.jpg",
    category: "Growth Hormone",
    research: "CJC-1295 is a synthetic GHRH analog with Drug Affinity Complex (DAC) technology, extending its half-life. Ipamorelin is a selective growth hormone secretagogue that mimics ghrelin. When combined, research suggests a synergistic effect on GH release via complementary mechanisms — CJC-1295 amplifies the GH pulse while Ipamorelin triggers it. Preclinical data indicates this combination promotes pulsatile GH secretion while minimizing cortisol and prolactin elevation.",
    sequence: "CJC-1295: Modified GHRH (1-29) | Ipamorelin: Aib-His-D-2-Nal-D-Phe-Lys-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "bpc157-5",
    name: "BPC-157",
    dose: "5 mg",
    price: 35,
    bulk: 30,
    image: "/bpc157-5.jpg",
    category: "Recovery",
    research: "BPC-157 (Body Protection Compound-157) is a pentadecapeptide derived from human gastric juice. Extensive preclinical research demonstrates its involvement in angiogenesis, wound healing, and tissue repair across muscle, tendon, ligament, and nerve tissues. Studies suggest it modulates the nitric oxide system, upregulates growth factor expression, and interacts with the dopaminergic system. It has shown cytoprotective properties in various organ systems in animal models.",
    sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "bpc157-10",
    name: "BPC-157",
    dose: "10 mg",
    price: 50,
    bulk: 45,
    image: "/bpc157-10.jpg",
    category: "Recovery",
    research: "BPC-157 (Body Protection Compound-157) is a pentadecapeptide derived from human gastric juice. Extensive preclinical research demonstrates its involvement in angiogenesis, wound healing, and tissue repair across muscle, tendon, ligament, and nerve tissues. Studies suggest it modulates the nitric oxide system, upregulates growth factor expression, and interacts with the dopaminergic system. It has shown cytoprotective properties in various organ systems in animal models.",
    sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "tb500",
    name: "TB-500",
    dose: "10 mg",
    price: 55,
    bulk: 50,
    image: "/tb500.jpg",
    category: "Recovery",
    research: "TB-500 is a synthetic fraction of the naturally occurring thymosin beta-4 protein. Research has demonstrated its role in cell migration, blood vessel formation, and regulation of actin — a key cell-building protein. Preclinical studies indicate TB-500 promotes tissue repair by upregulating cell-building proteins, reducing inflammation, and facilitating new blood vessel growth. It has been studied for its effects on wound healing, cardiac tissue repair, and musculoskeletal recovery.",
    sequence: "Synthetic fragment of Thymosin Beta-4 (Tβ4)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "epitalon",
    name: "Epitalon",
    dose: "10 mg",
    price: 35,
    bulk: 30,
    image: "/epitalon.jpg",
    category: "Longevity",
    research: "Epitalon (Epithalon) is a synthetic tetrapeptide based on the natural epithalamin peptide produced by the pineal gland. Research has focused on its potential to activate telomerase, the enzyme responsible for maintaining telomere length — a key biomarker of cellular aging. Studies by Professor Khavinson demonstrated increased telomerase activity and telomere elongation in human somatic cells. Additional research suggests effects on melatonin production, circadian rhythm regulation, and antioxidant enzyme activity.",
    sequence: "Ala-Glu-Asp-Gly",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 6 weeks.",
    purity: "99%+",
  },
  {
    id: "ghkcu-50",
    name: "GHK-Cu",
    dose: "50 mg",
    price: 40,
    bulk: 35,
    image: "/ghkcu-50.jpg",
    category: "Longevity",
    research: "GHK-Cu (copper peptide) is a naturally occurring tripeptide with high affinity for copper(II) ions. Found in human plasma, saliva, and urine, its concentration declines with age. Research demonstrates it modulates over 4,000 human genes, promoting tissue remodeling, anti-inflammatory responses, and stem cell attraction to injury sites. Studies have examined its role in collagen synthesis, wound healing, skin regeneration, hair growth, and antioxidant defense mechanisms.",
    sequence: "Gly-His-Lys-Cu²⁺",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "ghkcu-100",
    name: "GHK-Cu",
    dose: "100 mg",
    price: 55,
    bulk: 50,
    image: "/ghkcu-100.jpg",
    category: "Longevity",
    research: "GHK-Cu (copper peptide) is a naturally occurring tripeptide with high affinity for copper(II) ions. Found in human plasma, saliva, and urine, its concentration declines with age. Research demonstrates it modulates over 4,000 human genes, promoting tissue remodeling, anti-inflammatory responses, and stem cell attraction to injury sites. Studies have examined its role in collagen synthesis, wound healing, skin regeneration, hair growth, and antioxidant defense mechanisms.",
    sequence: "Gly-His-Lys-Cu²⁺",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "ss31",
    name: "SS-31",
    dose: "10 mg",
    price: 80,
    bulk: 70,
    image: "/ss31.jpg",
    category: "Longevity",
    research: "SS-31 (Elamipretide) is a mitochondria-targeted tetrapeptide that selectively concentrates in the inner mitochondrial membrane. Research demonstrates it binds to cardiolipin, stabilizing the electron transport chain and reducing reactive oxygen species production. Preclinical studies show improved mitochondrial function, enhanced ATP production, and reduced oxidative stress. It has been investigated for age-related mitochondrial dysfunction, cardiac and renal conditions, and neurodegenerative research models.",
    sequence: "D-Arg-Dmt-Lys-Phe-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "ipamorelin",
    name: "Ipamorelin",
    dose: "5 mg",
    price: 35,
    bulk: 30,
    image: "/ipamorelin.jpg",
    category: "Growth Hormone",
    research: "Ipamorelin is a selective growth hormone secretagogue receptor (GHS-R) agonist and one of the most selective GH-releasing peptides studied. Unlike other GHRPs, research indicates it does not significantly elevate cortisol, acetylcholine, prolactin, or aldosterone levels at effective doses. Studies demonstrate dose-dependent GH release with a favorable selectivity profile. It has been researched for its effects on bone density, body composition, and growth hormone pulsatility.",
    sequence: "Aib-His-D-2-Nal-D-Phe-Lys-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "kisspeptin",
    name: "Kisspeptin",
    dose: "10 mg",
    price: 55,
    bulk: 45,
    image: "/kisspeptin.jpg",
    category: "Hormonal",
    research: "Kisspeptin is a neuropeptide encoded by the KISS1 gene and is a key regulator of the hypothalamic-pituitary-gonadal (HPG) axis. Research demonstrates it stimulates GnRH neurons, triggering the release of luteinizing hormone (LH) and follicle-stimulating hormone (FSH). Studies have examined its role in puberty onset, reproductive function, and as a diagnostic tool for reproductive disorders. It has been investigated for its effects on testosterone production and fertility markers.",
    sequence: "Kisspeptin-10 (KISS1 derived)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 3 weeks.",
    purity: "99%+",
  },
  {
    id: "motsc",
    name: "MOTS-c",
    dose: "10 mg",
    price: 60,
    bulk: 55,
    image: "/motsc.jpg",
    category: "Longevity",
    research: "MOTS-c (Mitochondrial Open Reading Frame of the Twelve S rRNA type-c) is a mitochondrial-derived peptide. Research led by Dr. Pinchas Cohen identified it as a key regulator of metabolic homeostasis. Studies demonstrate it activates AMPK, enhances glucose uptake, improves insulin sensitivity, and regulates fatty acid metabolism. It has been described as an exercise mimetic, with research showing it translocates to the nucleus during metabolic stress to regulate adaptive gene expression.",
    sequence: "16-amino acid mitochondrial-derived peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "selank",
    name: "Selank",
    dose: "10 mg",
    price: 55,
    bulk: 45,
    image: "/selank.jpg",
    category: "Cognitive",
    research: "Selank is a synthetic analog of the immunomodulatory peptide tuftsin, developed at the Institute of Molecular Genetics of the Russian Academy of Sciences. Research indicates it influences the expression of brain-derived neurotrophic factor (BDNF), modulates the balance of T-helper cell cytokines, and affects enkephalin degradation. Studies have examined its anxiolytic, nootropic, and immunomodulatory properties. It is approved in Russia as an anxiolytic medication.",
    sequence: "Thr-Lys-Pro-Arg-Pro-Gly-Pro (Tuftsin analog with Gly-Pro extension)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "semax",
    name: "Semax",
    dose: "10 mg",
    price: 55,
    bulk: 45,
    image: "/semax.jpg",
    category: "Cognitive",
    research: "Semax is a synthetic peptide derived from a fragment of adrenocorticotropic hormone (ACTH 4-10). Developed at the Institute of Molecular Genetics, Russian Academy of Sciences, research demonstrates it increases BDNF and its signaling receptor TrkB in the hippocampus. Studies indicate neuroprotective, nootropic, and neurogenic properties. It has been investigated for cognitive enhancement, cerebrovascular conditions, and optic nerve health. Approved in Russia as a nootropic medication.",
    sequence: "Met-Glu-His-Phe-Pro-Gly-Pro (ACTH 4-10 with Pro-Gly-Pro extension)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glow",
    name: "GLOW",
    dose: "70 mg",
    price: 160,
    bulk: 140,
    image: "/glow.jpg",
    category: "Blends",
    research: "GLOW is a proprietary peptide blend formulated by Tier One BioSystems for research applications targeting skin health and rejuvenation pathways. This 70 mg complex combines multiple bioactive peptides selected for their studied effects on collagen synthesis, cellular turnover, and tissue regeneration. The blend is designed for researchers investigating multi-pathway approaches to dermal matrix remodeling and growth factor signaling cascades.",
    sequence: "Proprietary multi-peptide blend",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "klow",
    name: "KLOW",
    dose: "80 mg",
    price: 165,
    bulk: 145,
    image: "/klow.jpg",
    category: "Blends",
    research: "KLOW is a proprietary peptide blend developed by Tier One BioSystems for advanced metabolic research. This 80 mg formulation combines targeted peptides selected for their studied effects on metabolic signaling, energy homeostasis, and body composition regulation. The blend is designed for researchers investigating synergistic multi-pathway approaches to metabolic optimization and weight management signaling cascades.",
    sequence: "Proprietary multi-peptide blend",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "hcg",
    name: "HCG",
    dose: "5000 IU",
    price: 65,
    bulk: 55,
    image: "/hcg.jpg",
    category: "Hormonal",
    research: "Human Chorionic Gonadotropin (HCG) is a glycoprotein hormone composed of alpha and beta subunits. Research demonstrates it mimics luteinizing hormone (LH) activity by binding to LH/CG receptors. Studies have extensively examined its role in stimulating Leydig cell testosterone production, supporting spermatogenesis, and maintaining testicular function. It is widely used in clinical research relating to hypogonadism, fertility protocols, and hormonal axis regulation.",
    sequence: "Glycoprotein hormone (α and β subunits, ~237 amino acids total)",
    storage: "Store powder in the refrigerator (35–46°F / 2–8°C). Once reconstituted, keep refrigerated and use within 30 days.",
    purity: "99%+",
  },
  {
    id: "mt1",
    name: "MT-1",
    dose: "10 mg",
    price: 40,
    bulk: 35,
    image: "/mt1.jpg",
    category: "Tanning",
    research: "Melanotan I (Afamelanotide) is a synthetic analog of alpha-melanocyte stimulating hormone (α-MSH). Research demonstrates it binds to the MC1R melanocortin receptor, stimulating melanogenesis — the production of melanin pigment. Studies have examined its photoprotective properties and its potential to increase eumelanin production in skin cells. It has been the subject of clinical research for conditions involving photosensitivity and has been investigated as a potential UV-protective compound.",
    sequence: "Ac-Ser-Tyr-Ser-Nle-Glu-His-D-Phe-Arg-Trp-Gly-Lys-Pro-Val-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "mt2",
    name: "MT-2",
    dose: "10 mg",
    price: 40,
    bulk: 35,
    image: "/mt2.jpg",
    category: "Tanning",
    research: "Melanotan II is a cyclic heptapeptide analog of α-MSH that acts as a non-selective agonist at melanocortin receptors (MC1R-MC5R). Research demonstrates broader receptor activity compared to MT-1, with studies examining its effects on melanogenesis, appetite, and libido through MC3R and MC4R activation. Preclinical research has investigated its dual melanotropic and aphrodisiac properties. Its cyclic structure provides enhanced metabolic stability compared to linear analogs.",
    sequence: "Ac-Nle-c[Asp-His-D-Phe-Arg-Trp-Lys]-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "ta1",
    name: "Thymosin Alpha 1",
    dose: "10 mg",
    price: 95,
    bulk: 80,
    image: "/ta1.jpg",
    category: "Immune",
    research: "Thymosin Alpha 1 (Tα1) is a peptide naturally produced by the thymus gland, first isolated by Dr. Allan Goldstein. Research demonstrates it enhances T-cell maturation, dendritic cell function, and antibody responses. Studies indicate it modulates both innate and adaptive immunity by activating toll-like receptors (TLR2 and TLR9). It is approved in over 35 countries for various clinical applications and has been extensively studied for immune modulation in immunocompromised subjects.",
    sequence: "28-amino acid peptide (Ac-SDAAVDTSSEITTKDLKEKKEVVEEAEN-OH)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "nad",
    name: "NAD+",
    dose: "500 mg",
    price: 70,
    bulk: 65,
    image: "/nad.jpg",
    category: "Longevity",
    research: "Nicotinamide adenine dinucleotide (NAD+) is a critical coenzyme found in every living cell. Research demonstrates it is essential for mitochondrial function, DNA repair via PARP enzymes, sirtuin activation, and cellular energy metabolism. NAD+ levels decline significantly with age, and this decline has been linked to metabolic dysfunction and age-related conditions. Studies have examined direct NAD+ supplementation for its effects on cellular energy production, circadian rhythm regulation, and genomic stability.",
    sequence: "C₂₁H₂₇N₇O₁₄P₂ (dinucleotide coenzyme)",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light and moisture. Once reconstituted, use promptly.",
    purity: "99%+",
  },
  {
    id: "igf1lr3",
    name: "IGF-1 LR3",
    dose: "1 mg",
    price: 105,
    bulk: 90,
    image: "/igf1lr3.jpg",
    category: "Growth Hormone",
    research: "IGF-1 LR3 (Long R3 Insulin-like Growth Factor-1) is an 83-amino acid analog of human IGF-1 with an arginine substitution at position 3 and a 13-amino acid N-terminal extension. This modification dramatically reduces binding to IGF binding proteins (IGFBPs), resulting in enhanced bioavailability and a significantly longer half-life. Research demonstrates it activates the IGF-1 receptor, promoting cell proliferation, differentiation, and survival signaling via the PI3K/Akt and MAPK/ERK pathways.",
    sequence: "83-amino acid modified IGF-1 (Arg³ substitution + N-terminal extension)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks. Reconstitute using 0.1M acetic acid.",
    purity: "99%+",
  },
  {
    id: "kpv",
    name: "KPV",
    dose: "10 mg",
    price: 60,
    bulk: 50,
    image: "/kpv.jpg",
    category: "Immune",
    research: "KPV is a naturally occurring tripeptide derived from the C-terminal end of alpha-melanocyte stimulating hormone (α-MSH). Research demonstrates potent anti-inflammatory activity through inhibition of NF-κB signaling, a master regulator of inflammatory gene expression. Studies have examined its effects on gut inflammation, skin inflammatory conditions, and wound healing. Unlike full-length α-MSH, KPV retains anti-inflammatory properties without melanotropic activity, making it a focused research tool.",
    sequence: "Lys-Pro-Val",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
];

// ─── Lab Results (Certificate of Analysis) ───────────────────────────────────
const LAB_RESULTS = {
  "GLP-3RT 5 mg": {
    lotNumber: "T1B-GLP3-5-2026-0412",
    dateAnalyzed: "2026-03-18",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.27 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.47%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.6 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.3%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.2%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.1%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLP-3RT 10 mg": {
    lotNumber: "T1B-GLP3-10-2026-0413",
    dateAnalyzed: "2026-03-18",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.41 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.52%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.7 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.1%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.9%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "7.6%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLP-3RT 20 mg": {
    lotNumber: "T1B-GLP3-20-2026-0414",
    dateAnalyzed: "2026-03-19",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "20.00 mg/vial", result: "20.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "18.00–22.00 mg/vial", result: "20.74 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.46%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.4%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.1%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "7.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLP-3RT 30 mg": {
    lotNumber: "T1B-GLP3-30-2026-0414",
    dateAnalyzed: "2026-03-19",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "30.00 mg/vial", result: "30.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "27.00–33.00 mg/vial", result: "31.18 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.39%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.9 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.5%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.6%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Tesamorelin": {
    lotNumber: "T1B-TESA-2026-0389",
    dateAnalyzed: "2026-03-15",
    molecularWeight: "5135.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.14 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.31%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "5135.9 ± 1.5 Da", result: "5135.7 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "85.9%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.1%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "9.4%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "CJC-1295 / Ipamorelin": {
    lotNumber: "T1B-CJCI-2026-0401",
    dateAnalyzed: "2026-03-20",
    molecularWeight: "CJC: 3367.9 Da / Ipa: 711.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "12.00 mg/vial", result: "12.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "10.80–13.20 mg/vial", result: "12.53 mg/vial", pass: true },
      { test: "Purity — CJC-1295 (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.52%", pass: true },
      { test: "Purity — Ipamorelin (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.38%", pass: true },
      { test: "Mass Confirmation — CJC-1295", method: "ESI-MS", specification: "3367.9 ± 1.0 Da", result: "3368.1 Da", pass: true },
      { test: "Mass Confirmation — Ipamorelin", method: "ESI-MS", specification: "711.9 ± 0.5 Da", result: "711.8 Da", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.7%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "BPC-157 5 mg": {
    lotNumber: "T1B-BPC-5-2026-0377",
    dateAnalyzed: "2026-03-12",
    molecularWeight: "1419.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.19 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.61%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1419.5 ± 0.5 Da", result: "1419.4 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.6%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "7.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "BPC-157 10 mg": {
    lotNumber: "T1B-BPC-10-2026-0378",
    dateAnalyzed: "2026-03-13",
    molecularWeight: "1419.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.38 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.57%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1419.5 ± 0.5 Da", result: "1419.5 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.9%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "TB-500": {
    lotNumber: "T1B-TB5-2026-0395",
    dateAnalyzed: "2026-03-17",
    molecularWeight: "4963.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.64 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.28%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "4963.5 ± 1.5 Da", result: "4963.3 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "84.5%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.7%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "10.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Epitalon": {
    lotNumber: "T1B-EPI-2026-0408",
    dateAnalyzed: "2026-03-22",
    molecularWeight: "390.3 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "20.00 mg/vial", result: "20.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "18.00–22.00 mg/vial", result: "20.73 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.72%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "390.3 ± 0.5 Da", result: "390.3 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "91.0%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "2.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GHK-Cu 50 mg": {
    lotNumber: "T1B-GHK50-2026-0416",
    dateAnalyzed: "2026-03-25",
    molecularWeight: "403.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "Blue lyophilized powder", result: "Blue lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "50.00 mg/vial", result: "50.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "45.00–55.00 mg/vial", result: "51.57 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.68%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "403.9 ± 0.5 Da", result: "403.9 Da", pass: true },
      { test: "Copper Content", method: "ICP-MS", specification: "15.0–16.5%", result: "15.5%", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.4%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GHK-Cu 100 mg": {
    lotNumber: "T1B-GHK-2026-0415",
    dateAnalyzed: "2026-03-25",
    molecularWeight: "403.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "Blue lyophilized powder", result: "Blue lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "100.00 mg/vial", result: "100.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "90.00–110.00 mg/vial", result: "103.47 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.55%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "403.9 ± 0.5 Da", result: "403.8 Da", pass: true },
      { test: "Copper Content", method: "ICP-MS", specification: "15.0–16.5%", result: "15.8%", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "89.4%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.1%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "SS-31": {
    lotNumber: "T1B-SS31-2026-0421",
    dateAnalyzed: "2026-03-26",
    molecularWeight: "639.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "15.00 mg/vial", result: "15.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "13.50–16.50 mg/vial", result: "15.82 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.34%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "639.8 ± 0.5 Da", result: "639.7 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.1%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.5%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Ipamorelin": {
    lotNumber: "T1B-IPA-2026-0383",
    dateAnalyzed: "2026-03-14",
    molecularWeight: "711.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.11 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.44%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "711.9 ± 0.5 Da", result: "711.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.0%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Kisspeptin": {
    lotNumber: "T1B-KISS-2026-0427",
    dateAnalyzed: "2026-03-28",
    molecularWeight: "1302.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "4.87 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.19%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1302.5 ± 0.5 Da", result: "1302.4 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "85.3%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "MOTS-c": {
    lotNumber: "T1B-MOT-2026-0430",
    dateAnalyzed: "2026-03-29",
    molecularWeight: "2174.6 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.29 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.25%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "2174.6 ± 1.0 Da", result: "2174.5 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.8%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.7%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Selank": {
    lotNumber: "T1B-SEL-2026-0392",
    dateAnalyzed: "2026-03-16",
    molecularWeight: "751.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.33 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.58%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "751.9 ± 0.5 Da", result: "751.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.9%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.4%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Semax": {
    lotNumber: "T1B-SEM-2026-0398",
    dateAnalyzed: "2026-03-19",
    molecularWeight: "813.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.52 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.41%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "813.9 ± 0.5 Da", result: "813.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.3%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLOW": {
    lotNumber: "T1B-GLW-2026-0435",
    dateAnalyzed: "2026-03-30",
    molecularWeight: "Proprietary blend",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "70.00 mg/vial", result: "70.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "63.00–77.00 mg/vial", result: "72.41 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.33%", pass: true },
      { test: "Component Verification", method: "LC-MS/MS", specification: "All components confirmed", result: "All confirmed", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "85.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "KLOW": {
    lotNumber: "T1B-KLW-2026-0438",
    dateAnalyzed: "2026-03-31",
    molecularWeight: "Proprietary blend",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "80.00 mg/vial", result: "80.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "72.00–88.00 mg/vial", result: "83.16 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.27%", pass: true },
      { test: "Component Verification", method: "LC-MS/MS", specification: "All components confirmed", result: "All confirmed", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "84.8%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.3%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "HCG": {
    lotNumber: "T1B-HCG-2026-0405",
    dateAnalyzed: "2026-03-21",
    molecularWeight: "~25,700 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Content", method: "Gravimetric", specification: "5,000 IU/vial", result: "5,000 IU/vial", pass: true },
      { test: "Actual Content", method: "Bioassay", specification: "4,500–5,500 IU/vial", result: "5,210 IU/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.15%", pass: true },
      { test: "Identity Confirmation", method: "SDS-PAGE / Western Blot", specification: "Consistent with HCG", result: "Confirmed", pass: true },
      { test: "Biological Activity", method: "Bioassay", specification: "≥ 5,000 IU/mg", result: "5,420 IU/mg", pass: true },
      { test: "Protein Content", method: "Bradford Assay", specification: "≥ 80%", result: "86.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "MT-1": {
    lotNumber: "T1B-MT1-2026-0418",
    dateAnalyzed: "2026-03-24",
    molecularWeight: "1646.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.17 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.39%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1646.9 ± 0.5 Da", result: "1646.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.1%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "MT-2": {
    lotNumber: "T1B-MT2-2026-0419",
    dateAnalyzed: "2026-03-24",
    molecularWeight: "1024.2 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "9.83 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.46%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1024.2 ± 0.5 Da", result: "1024.1 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.5%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Thymosin Alpha 1": {
    lotNumber: "T1B-TA1-2026-0424",
    dateAnalyzed: "2026-03-27",
    molecularWeight: "3108.3 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.22 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.37%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3108.3 ± 1.0 Da", result: "3108.2 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.4%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "NAD+": {
    lotNumber: "T1B-NAD-2026-0410",
    dateAnalyzed: "2026-03-23",
    molecularWeight: "663.4 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Content", method: "Gravimetric", specification: "500.00 mg/vial", result: "500.00 mg/vial", pass: true },
      { test: "Actual Content", method: "UV Quantitation", specification: "450.00–550.00 mg/vial", result: "518.40 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.62%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "663.4 ± 0.5 Da", result: "663.4 Da", pass: true },
      { test: "Identity Confirmation", method: "UV/Vis Spectroscopy", specification: "λmax 259 nm", result: "λmax 259 nm", pass: true },
      { test: "Content Assay", method: "UV Quantitation", specification: "≥ 95%", result: "97.8%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.0%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "BAC Water": {
    lotNumber: "T1B-BAC-2026-0440",
    dateAnalyzed: "2026-03-31",
    molecularWeight: "N/A",
    tests: [
      { test: "Appearance", method: "Visual", specification: "Clear, colorless solution", result: "Clear, colorless", pass: true },
      { test: "Labeled Volume", method: "Gravimetric", specification: "30.00 mL/vial", result: "30.00 mL/vial", pass: true },
      { test: "Actual Volume", method: "Volumetric", specification: "29.50–30.50 mL/vial", result: "30.21 mL/vial", pass: true },
      { test: "pH", method: "Potentiometric", specification: "4.5–7.0", result: "5.4", pass: true },
      { test: "Benzyl Alcohol Content", method: "GC-FID", specification: "0.85–0.95%", result: "0.90%", pass: true },
      { test: "Particulate Matter", method: "USP <788>", specification: "Meets USP requirements", result: "Within limits", pass: true },
      { test: "Sterility", method: "USP <71>", specification: "No growth", result: "No growth", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 0.25 EU/mL", result: "< 0.1 EU/mL", pass: true },
    ],
  },
  "IGF-1 LR3": {
    lotNumber: "T1B-IGF-2026-0433",
    dateAnalyzed: "2026-03-29",
    molecularWeight: "9111.4 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "1.00 mg/vial", result: "1.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "0.90–1.10 mg/vial", result: "1.06 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.21%", pass: true },
      { test: "Mass Confirmation", method: "MALDI-TOF", specification: "9111.4 ± 5.0 Da", result: "9112.1 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "83.7%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "KPV": {
    lotNumber: "T1B-KPV-2026-0437",
    dateAnalyzed: "2026-03-30",
    molecularWeight: "342.4 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.44 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.68%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "342.4 ± 0.5 Da", result: "342.4 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "90.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "2.7%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
};

function getLabResults(productName, dose) {
  // Check for dose-specific entry first (e.g., "GLP-3RT 5 mg")
  const doseKey = dose ? `${productName} ${dose}` : productName;
  if (LAB_RESULTS[doseKey]) return LAB_RESULTS[doseKey];
  if (LAB_RESULTS[productName]) return LAB_RESULTS[productName];
  return null;
}

// ─── Molecular Profiles (per compound) ────────────────────────────────────────
const MOLECULAR_PROFILES = {
  "BPC-157": {
    type: "Synthetic pentadecapeptide (Body Protection Compound)",
    aminoAcids: "15 — Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    molecularWeight: "1,419.55 g/mol",
    casNumber: "137525-51-0",
    molecularFormula: "C₆₂H₉₈N₁₆O₂₂",
    modification: "Free peptide (acetate salt form for storage)",
    pubchemCID: "9941957",
  },
  "GLP-3RT": {
    type: "Triple incretin receptor agonist (GLP-1 / GIP / Glucagon) — known generically as Retatrutide / LY-3437943",
    aminoAcids: "39 (modified GLP-1 backbone with Aib & α-Me-Leu substitutions)",
    molecularWeight: "4,894.58 g/mol",
    casNumber: "2381089-83-2",
    molecularFormula: "C₂₂₈H₃₅₀N₄₈O₆₆",
    modification: "C20 diacid fatty-acid acylation via γ-Glu-AEEA linker on Lys17",
    pubchemCID: "162363932",
  },
  "Tesamorelin": {
    type: "Synthetic growth hormone-releasing factor (GRF) analogue",
    aminoAcids: "44 (human GRF 1-44 sequence)",
    molecularWeight: "5,135.9 g/mol",
    casNumber: "218949-48-5",
    molecularFormula: "C₂₂₁H₃₆₆N₇₂O₆₇S",
    modification: "trans-3-hexenoyl group on N-terminal tyrosine",
    pubchemCID: "16159350",
  },
  "CJC-1295 / Ipamorelin": {
    type: "Blend — CJC-1295 (Mod GRF 1-29, growth hormone secretagogue) + Ipamorelin (selective ghrelin receptor agonist)",
    aminoAcids: "29 (CJC-1295) + 5 (Ipamorelin)",
    molecularWeight: "3,367.9 g/mol (CJC-1295) + 711.85 g/mol (Ipamorelin)",
    casNumber: "446036-97-1 (CJC-1295) · 170851-70-4 (Ipamorelin)",
    molecularFormula: "C₁₅₂H₂₅₂N₄₄O₄₂ + C₃₈H₄₉N₉O₅",
    modification: "Combined non-DAC formulation, equimolar dosing",
  },
  "TB-500": {
    type: "Synthetic N-acetylated active fragment of Thymosin β4 (residues 17–23) — actin-binding heptapeptide",
    aminoAcids: "7 — Ac-Leu-Lys-Lys-Thr-Glu-Thr-Gln",
    molecularWeight: "889.0 g/mol",
    casNumber: "77591-33-4",
    molecularFormula: "C₃₇H₆₂N₁₀O₁₄",
    modification: "N-terminal acetylation",
  },
  "Epitalon": {
    type: "Synthetic tetrapeptide (synthetic Epithalamin from pineal gland)",
    aminoAcids: "4 — Ala-Glu-Asp-Gly (AEDG)",
    molecularWeight: "390.35 g/mol",
    casNumber: "307297-39-8",
    molecularFormula: "C₁₄H₂₂N₄O₉",
    modification: "Free peptide",
    pubchemCID: "219042",
  },
  "GHK-Cu": {
    type: "Copper-binding tripeptide complex (Copper Tripeptide-1)",
    aminoAcids: "3 — Gly-His-Lys",
    molecularWeight: "403.9 g/mol (Cu²⁺ complex)",
    casNumber: "49557-75-7",
    molecularFormula: "C₁₄H₂₂CuN₆O₄",
    modification: "Coordinated with Cu²⁺ ion",
    pubchemCID: "73587",
  },
  "SS-31": {
    type: "Mitochondria-targeted tetrapeptide (also known as Elamipretide / Bendavia / MTP-131)",
    aminoAcids: "4 — D-Arg-Dmt-Lys-Phe-NH₂ (Dmt = 2',6'-dimethyltyrosine)",
    molecularWeight: "639.78 g/mol",
    casNumber: "736992-21-5",
    molecularFormula: "C₃₂H₄₉N₉O₅",
    modification: "C-terminal amidation; cationic-aromatic alternating motif binds cardiolipin",
    pubchemCID: "16124497",
  },
  "Ipamorelin": {
    type: "Selective growth hormone secretagogue (ghrelin receptor agonist)",
    aminoAcids: "5 — Aib-His-D-2-Nal-D-Phe-Lys-NH₂",
    molecularWeight: "711.85 g/mol",
    casNumber: "170851-70-4",
    molecularFormula: "C₃₈H₄₉N₉O₅",
    modification: "C-terminal amidation; Aib = 2-aminoisobutyric acid",
    pubchemCID: "9831659",
  },
  "Kisspeptin": {
    type: "C-terminal decapeptide of human metastin / KISS1 gene product",
    aminoAcids: "10 — Tyr-Asn-Trp-Asn-Ser-Phe-Gly-Leu-Arg-Phe-NH₂",
    molecularWeight: "1,302.4 g/mol",
    casNumber: "374675-21-5",
    molecularFormula: "C₆₃H₈₃N₁₇O₁₄",
    modification: "C-terminal amidation",
    pubchemCID: "11953861",
  },
  "MOTS-c": {
    type: "Mitochondrial-derived peptide (encoded by mitochondrial MT-RNR1 gene)",
    aminoAcids: "16 — Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg",
    molecularWeight: "2,174.6 g/mol",
    casNumber: "1627580-64-6",
    molecularFormula: "C₁₀₁H₁₅₂N₂₈O₂₂S₂",
    modification: "Free peptide; activates AMPK pathway",
    pubchemCID: "118767809",
  },
  "Selank": {
    type: "Synthetic anxiolytic / nootropic heptapeptide (Tuftsin analogue)",
    aminoAcids: "7 — Thr-Lys-Pro-Arg-Pro-Gly-Pro",
    molecularWeight: "751.87 g/mol",
    casNumber: "129954-34-3",
    molecularFormula: "C₃₃H₅₇N₁₁O₉",
    modification: "Free peptide; Pro-Gly-Pro C-terminal extension stabilises Tuftsin",
    pubchemCID: "11765637",
  },
  "Semax": {
    type: "Synthetic ACTH(4-10) analogue with C-terminal Pro-Gly-Pro tail (nootropic)",
    aminoAcids: "7 — Met-Glu-His-Phe-Pro-Gly-Pro",
    molecularWeight: "813.92 g/mol",
    casNumber: "80714-61-0",
    molecularFormula: "C₃₇H₅₁N₉O₁₀S",
    modification: "Pro-Gly-Pro C-terminal extension for proteolytic stability",
    pubchemCID: "11765643",
  },
  "MT-1": {
    type: "Linear synthetic α-MSH analogue (Afamelanotide) — MC1R agonist",
    aminoAcids: "13 — Ac-Ser-Tyr-Ser-Nle-Glu-His-D-Phe-Arg-Trp-Gly-Lys-Pro-Val-NH₂",
    molecularWeight: "1,646.85 g/mol",
    casNumber: "75921-69-6",
    molecularFormula: "C₇₈H₁₁₁N₂₁O₁₉",
    modification: "N-terminal acetylation, C-terminal amidation, Nle (norleucine) at position 4",
    pubchemCID: "16154950",
  },
  "MT-2": {
    type: "Cyclic synthetic α-MSH analogue — MC3R / MC4R full agonist",
    aminoAcids: "7 — Ac-Nle-c[Asp-His-D-Phe-Arg-Trp-Lys]-NH₂ (cyclic lactam)",
    molecularWeight: "1,024.18 g/mol",
    casNumber: "121062-08-6",
    molecularFormula: "C₅₀H₆₉N₁₅O₉",
    modification: "Cyclic lactam between Asp and Lys side-chains; N-Ac, C-NH₂",
    pubchemCID: "16154980",
  },
  "Thymosin Alpha 1": {
    type: "Synthetic 28-amino-acid immunomodulating peptide (Thymalfasin)",
    aminoAcids: "28 — Ac-Ser-Asp-Ala-Ala-Val-Asp-Thr-Ser-Ser-Glu-Ile-Thr-Thr-Lys-Asp-Leu-Lys-Glu-Lys-Lys-Glu-Val-Val-Glu-Glu-Ala-Glu-Asn",
    molecularWeight: "3,108.28 g/mol",
    casNumber: "62304-98-7",
    molecularFormula: "C₁₂₉H₂₁₅N₃₃O₅₅",
    modification: "N-terminal acetylation; enhances Th1 immune response",
    pubchemCID: "16130571",
  },
  "IGF-1 LR3": {
    type: "Synthetic Long R3 IGF-1 analogue (Insulin-like Growth Factor-1, Long Arg³)",
    aminoAcids: "83 (13-residue N-terminal extension + IGF-1 backbone with Arg substitution at position 3)",
    molecularWeight: "9,117.5 g/mol",
    casNumber: "946870-92-4",
    molecularFormula: "C₄₀₀H₆₂₅N₁₁₁O₁₁₅S₉",
    modification: "13-aa N-terminal extension; Glu3 → Arg3 substitution (low IGFBP affinity, ~3× more potent than IGF-1)",
  },
  "KPV": {
    type: "C-terminal tripeptide fragment of α-MSH (anti-inflammatory, non-pigmenting)",
    aminoAcids: "3 — Lys-Pro-Val",
    molecularWeight: "342.44 g/mol",
    casNumber: "67727-97-3",
    molecularFormula: "C₁₆H₃₀N₄O₄",
    modification: "Free peptide; does not bind melanocortin receptors",
    pubchemCID: "125672",
  },
  "NAD+": {
    type: "Pyridine nucleotide coenzyme (not a peptide) — electron carrier in cellular metabolism",
    aminoAcids: null,
    molecularWeight: "663.43 g/mol",
    casNumber: "53-84-9",
    molecularFormula: "C₂₁H₂₇N₇O₁₄P₂",
    modification: "Ribosylnicotinamide-5′-diphosphate coupled to adenosine-5′-phosphate",
    pubchemCID: "5893",
  },
  "HCG": {
    type: "Glycoprotein hormone (not a single peptide) — heterodimer of α and β subunits",
    aminoAcids: "237 total — α subunit (92 aa) + β subunit (145 aa)",
    molecularWeight: "~36,700 Da (36.7 kDa); 25–40% carbohydrate by mass",
    casNumber: "9002-61-3",
    molecularFormula: null,
    modification: "Heavily glycosylated; α subunit identical to LH/FSH/TSH α",
  },
  "GLOW": {
    type: "Multi-target tissue repair and regeneration blend",
    totalContent: "70 mg/vial",
    form: "Lyophilized blend",
    components: [
      { name: "BPC-157", dose: "10 mg", role: "Gastric pentadecapeptide — gut and joint repair" },
      { name: "GHK-Cu", dose: "50 mg", role: "Copper tripeptide — skin, collagen, anti-inflammatory" },
      { name: "TB-500", dose: "10 mg", role: "Thymosin β4 fragment — actin binding, wound healing" },
    ],
  },
  "KLOW": {
    type: "Multi-target tissue repair, regeneration & anti-inflammatory blend",
    totalContent: "80 mg/vial",
    form: "Lyophilized blend",
    components: [
      { name: "BPC-157", dose: "10 mg", role: "Gastric pentadecapeptide — gut and joint repair" },
      { name: "GHK-Cu", dose: "50 mg", role: "Copper tripeptide — skin, collagen, anti-inflammatory" },
      { name: "TB-500", dose: "10 mg", role: "Thymosin β4 fragment — actin binding, wound healing" },
      { name: "KPV", dose: "10 mg", role: "α-MSH tripeptide — anti-inflammatory" },
    ],
  },
};

// ─── Research References (per compound) ───────────────────────────────────────
const REFERENCES = {
  "BPC-157": [
    { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
    { journal: "PHARMACEUTICS", title: "BPC-157 as an Investigational Peptide Therapeutic: Biopharmaceutical Challenges, Formulation Strategies, and Translational Development Barriers", year: 2025, identifier: "DOI: 10.3390/pharmaceutics18050625", url: "https://doi.org/10.3390/pharmaceutics18050625" },
    { journal: "BIOMEDICINES", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "Sikiric P et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
    { journal: "NEUROPEPTIDES", title: "Concerning BPC-157, a natural pentadecapeptide, that acts as a cytoprotectant", year: 2024, identifier: "PMID: 40759852", url: "https://pubmed.ncbi.nlm.nih.gov/40759852/" },
    { journal: "INT. J. MOL. SCI.", title: "Protective Effects of BPC 157 on Liver, Kidney, and Lung Distant Organ Damage in Rats with Experimental Ischemia–Reperfusion Injury", year: 2025, identifier: "PMC11857380", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11857380/" },
    { journal: "PUBCHEM", title: "BPC-157 — CID 9941957", identifier: "CID 9941957", url: "https://pubchem.ncbi.nlm.nih.gov/compound/9941957" },
  ],
  "GLP-3RT": [
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Coadministered Retatrutide and Semaglutide in Adults with Overweight or Obesity", year: 2025, identifier: "DOI: 10.1056/NEJMoa2502081", authors: "Garvey WT et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2502081" },
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Triple–Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial", year: 2023, identifier: "DOI: 10.1056/NEJMoa2301972", authors: "Jastreboff AM et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2301972" },
    { journal: "THE LANCET", title: "Retatrutide, a GIP/GLP-1/glucagon receptor agonist, for people with type 2 diabetes: a randomised, double-blind, placebo and active-controlled, phase 2 trial", year: 2023, identifier: "DOI: 10.1016/S0140-6736(23)01053-X", authors: "Rosenstock J et al.", url: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(23)01053-X/fulltext" },
    { journal: "WIKIPEDIA", title: "Retatrutide", url: "https://en.wikipedia.org/wiki/Retatrutide" },
    { journal: "PUBCHEM", title: "Retatrutide — CID 162363932", identifier: "CID 162363932", url: "https://pubchem.ncbi.nlm.nih.gov/compound/162363932" },
  ],
  "Tesamorelin": [
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Effects of Tesamorelin (TH9507), a Growth Hormone-Releasing Factor Analog, in HIV-Infected Patients with Excess Abdominal Fat", year: 2007, identifier: "DOI: 10.1056/NEJMoa073538", authors: "Falutz J et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa073538" },
    { journal: "JCEM", title: "Long-term safety and effects of tesamorelin, a growth hormone-releasing factor analog, in HIV patients with abdominal fat accumulation", year: 2008, identifier: "PMID: 18583464", url: "https://pubmed.ncbi.nlm.nih.gov/18583464/" },
    { journal: "WIKIPEDIA", title: "Tesamorelin", url: "https://en.wikipedia.org/wiki/Tesamorelin" },
    { journal: "PUBCHEM", title: "Tesamorelin Acetate — CID 16159350", identifier: "CID 16159350", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16159350" },
  ],
  "CJC-1295 / Ipamorelin": [
    { journal: "J CLIN ENDOCRINOL METAB", title: "Sustained effects of CJC-1295, a long-acting growth hormone-releasing hormone analog, on growth hormone and insulin-like growth factor I in healthy adults", year: 2006, identifier: "PMID: 16352683", authors: "Teichman SL et al.", url: "https://pubmed.ncbi.nlm.nih.gov/16352683/" },
    { journal: "EUR J ENDOCRINOL", title: "Ipamorelin, the first selective growth hormone secretagogue", year: 1998, identifier: "PMID: 9849822", authors: "Raun K et al.", url: "https://pubmed.ncbi.nlm.nih.gov/9849822/" },
    { journal: "WIKIPEDIA", title: "CJC-1295", url: "https://en.wikipedia.org/wiki/CJC-1295" },
    { journal: "WIKIPEDIA", title: "Ipamorelin", url: "https://en.wikipedia.org/wiki/Ipamorelin" },
  ],
  "TB-500": [
    { journal: "ANN N Y ACAD SCI", title: "Thymosin β4 and tissue repair: the actin-sequestering peptide that regulates cell migration and wound healing", year: 2010, identifier: "PMID: 20536557", authors: "Goldstein AL, Hannappel E, Sosne G, Kleinman HK", url: "https://pubmed.ncbi.nlm.nih.gov/20536557/" },
    { journal: "EXPERT OPIN BIOL THER", title: "Thymosin β4 in clinical trials — a critical evaluation", year: 2018, identifier: "PMID: 30130414", url: "https://pubmed.ncbi.nlm.nih.gov/30130414/" },
    { journal: "WIKIPEDIA", title: "TB-500", url: "https://en.wikipedia.org/wiki/TB-500" },
  ],
  "Epitalon": [
    { journal: "NEUROENDOCRINOL LETT", title: "Effect of the synthetic tetrapeptide epitalon on age-related changes in pineal gland", year: 2002, identifier: "PMID: 12433016", authors: "Khavinson VKh et al.", url: "https://pubmed.ncbi.nlm.nih.gov/12433016/" },
    { journal: "BIOGERONTOLOGY", title: "Telomere-elongating activity of the tetrapeptide EDR (Glu-Asp-Arg) and tetrapeptide AEDG (Ala-Glu-Asp-Gly, Epitalon) in human somatic cells", year: 2003, identifier: "PMID: 14618027", authors: "Khavinson VKh et al.", url: "https://pubmed.ncbi.nlm.nih.gov/14618027/" },
    { journal: "PUBCHEM", title: "Epithalon — CID 219042", identifier: "CID 219042", url: "https://pubchem.ncbi.nlm.nih.gov/compound/219042" },
  ],
  "GHK-Cu": [
    { journal: "BIOMED RES INT", title: "GHK-Cu may prevent oxidative stress in skin by regulating copper and modifying expression of numerous antioxidant genes", year: 2014, identifier: "PMID: 25196481", authors: "Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://pubmed.ncbi.nlm.nih.gov/25196481/" },
    { journal: "INT J MOL SCI", title: "The Effect of the Human Peptide GHK on Gene Expression Relevant to Nervous System Function and Cognitive Decline", year: 2017, identifier: "PMID: 28604617", authors: "Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://pubmed.ncbi.nlm.nih.gov/28604617/" },
    { journal: "WIKIPEDIA", title: "Copper peptide GHK-Cu", url: "https://en.wikipedia.org/wiki/Copper_peptide_GHK-Cu" },
    { journal: "PUBCHEM", title: "GHK-Cu Copper Tripeptide — CID 73587", identifier: "CID 73587", url: "https://pubchem.ncbi.nlm.nih.gov/compound/73587" },
  ],
  "SS-31": [
    { journal: "FDA NEWS RELEASE", title: "FDA approves Elamipretide (SS-31) for Barth syndrome", year: 2025, identifier: "Approved September 2025", url: "https://www.fda.gov/drugs/news-events-human-drugs/fda-approves-first-treatment-barth-syndrome" },
    { journal: "BR J PHARMACOL", title: "Cardiolipin-targeting peptide SS-31 in mitochondrial therapy", year: 2014, identifier: "PMID: 24138281", authors: "Szeto HH", url: "https://pubmed.ncbi.nlm.nih.gov/24138281/" },
    { journal: "WIKIPEDIA", title: "Elamipretide", url: "https://en.wikipedia.org/wiki/Elamipretide" },
    { journal: "PUBCHEM", title: "Elamipretide — CID 16124497", identifier: "CID 16124497", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16124497" },
  ],
  "Ipamorelin": [
    { journal: "EUR J ENDOCRINOL", title: "Ipamorelin, the first selective growth hormone secretagogue", year: 1998, identifier: "PMID: 9849822", authors: "Raun K et al.", url: "https://pubmed.ncbi.nlm.nih.gov/9849822/" },
    { journal: "WIKIPEDIA", title: "Ipamorelin", url: "https://en.wikipedia.org/wiki/Ipamorelin" },
    { journal: "PUBCHEM", title: "Ipamorelin — CID 9831659", identifier: "CID 9831659", url: "https://pubchem.ncbi.nlm.nih.gov/compound/9831659" },
  ],
  "Kisspeptin": [
    { journal: "J CLIN ENDOCRINOL METAB", title: "Kisspeptin-10 as a probe of GnRH neuron physiology in humans", year: 2012, identifier: "PMID: 22013105", authors: "Chan YM et al.", url: "https://pubmed.ncbi.nlm.nih.gov/22013105/" },
    { journal: "ENDOCR REV", title: "Kisspeptin and reproduction: physiological roles and regulatory mechanisms", year: 2009, identifier: "PMID: 19589949", authors: "Pinilla L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/19589949/" },
    { journal: "WIKIPEDIA", title: "Kisspeptin", url: "https://en.wikipedia.org/wiki/Kisspeptin" },
    { journal: "PUBCHEM", title: "Kisspeptin-10 — CID 11953861", identifier: "CID 11953861", url: "https://pubchem.ncbi.nlm.nih.gov/compound/11953861" },
  ],
  "MOTS-c": [
    { journal: "CELL METAB", title: "The mitochondrial-derived peptide MOTS-c promotes metabolic homeostasis and reduces obesity and insulin resistance", year: 2015, identifier: "PMID: 25738459", authors: "Lee C et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25738459/" },
    { journal: "FRONT ENDOCRINOL", title: "MOTS-c: A promising mitochondrial-derived peptide for therapeutic exploitation", year: 2023, identifier: "PMC9905433", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9905433/" },
    { journal: "WIKIPEDIA", title: "MOTS-c", url: "https://en.wikipedia.org/wiki/MOTS-c" },
  ],
  "Selank": [
    { journal: "ZH NEVROL PSIKHIATR IM S S KORSAKOVA", title: "Clinical and experimental evaluation of the anxiolytic action of Selank", year: 2005, identifier: "PMID: 16447562", authors: "Medvedev VE et al.", url: "https://pubmed.ncbi.nlm.nih.gov/16447562/" },
    { journal: "BULL EXP BIOL MED", title: "Selank, a peptide analog of tuftsin, influences gene expression in serotonergic and dopaminergic neurons", year: 2009, identifier: "PMID: 19798403", url: "https://pubmed.ncbi.nlm.nih.gov/19798403/" },
    { journal: "WIKIPEDIA", title: "Selank", url: "https://en.wikipedia.org/wiki/Selank" },
  ],
  "Semax": [
    { journal: "EXPERT OPIN INVESTIG DRUGS", title: "Semax, an analog of ACTH(4-10) with cognitive effects: from molecular mechanisms to clinical applications", year: 2018, identifier: "PMID: 30067100", url: "https://pubmed.ncbi.nlm.nih.gov/30067100/" },
    { journal: "INT J MOL SCI", title: "The Neuroprotective Effect of Semax in Models of Cerebral Ischemia: Role of BDNF and Trk-Receptor Signaling", year: 2019, identifier: "PMID: 31416202", url: "https://pubmed.ncbi.nlm.nih.gov/31416202/" },
    { journal: "WIKIPEDIA", title: "Semax", url: "https://en.wikipedia.org/wiki/Semax" },
  ],
  "MT-1": [
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Afamelanotide for Erythropoietic Protoporphyria", year: 2015, identifier: "DOI: 10.1056/NEJMoa1411481", authors: "Langendonk JG et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa1411481" },
    { journal: "WIKIPEDIA", title: "Afamelanotide", url: "https://en.wikipedia.org/wiki/Afamelanotide" },
    { journal: "PUBCHEM", title: "Afamelanotide — CID 16154950", identifier: "CID 16154950", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16154950" },
  ],
  "MT-2": [
    { journal: "INT J IMPOT RES", title: "PT-141 (bremelanotide): a melanocortin agonist for the treatment of sexual dysfunction (background on MT-II structure)", year: 2006, identifier: "PMID: 17075600", url: "https://pubmed.ncbi.nlm.nih.gov/17075600/" },
    { journal: "WIKIPEDIA", title: "Melanotan II", url: "https://en.wikipedia.org/wiki/Melanotan_II" },
    { journal: "PUBCHEM", title: "Melanotan II — CID 16154980", identifier: "CID 16154980", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16154980" },
  ],
  "Thymosin Alpha 1": [
    { journal: "EXPERT OPIN BIOL THER", title: "Thymosin α1: from bench to bedside", year: 2018, identifier: "PMID: 29469595", authors: "Romani L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/29469595/" },
    { journal: "ANN N Y ACAD SCI", title: "Thymosin α1 as a chemotherapy adjuvant: meta-analyses and reviews", year: 2010, identifier: "PMID: 20536572", url: "https://pubmed.ncbi.nlm.nih.gov/20536572/" },
    { journal: "WIKIPEDIA", title: "Thymalfasin", url: "https://en.wikipedia.org/wiki/Thymalfasin" },
    { journal: "PUBCHEM", title: "Thymosin α1 — CID 16130571", identifier: "CID 16130571", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16130571" },
  ],
  "IGF-1 LR3": [
    { journal: "GROWTH FACTORS", title: "Long-R(3)-IGF-1, an IGF-1 analog with low affinity for IGF-binding proteins, is highly potent in stimulating cell proliferation", year: 2001, identifier: "PMID: 11302359", url: "https://pubmed.ncbi.nlm.nih.gov/11302359/" },
    { journal: "WIKIPEDIA", title: "IGF-1 LR3", url: "https://en.wikipedia.org/wiki/IGF-1_LR3" },
  ],
  "KPV": [
    { journal: "PEPTIDES", title: "α-MSH-derived tripeptide KPV exerts anti-inflammatory effects via the melanocortin pathway", year: 2003, identifier: "PMID: 12676251", url: "https://pubmed.ncbi.nlm.nih.gov/12676251/" },
    { journal: "FASEB J", title: "The tripeptide KPV (Lys-Pro-Val) reduces inflammation in models of colitis", year: 2010, identifier: "PMID: 20736340", url: "https://pubmed.ncbi.nlm.nih.gov/20736340/" },
    { journal: "WIKIPEDIA", title: "KPV tripeptide", url: "https://en.wikipedia.org/wiki/KPV_tripeptide" },
    { journal: "PUBCHEM", title: "KPV — CID 125672", identifier: "CID 125672", url: "https://pubchem.ncbi.nlm.nih.gov/compound/125672" },
  ],
  "NAD+": [
    { journal: "CELL METAB", title: "NAD+ Metabolism and Its Roles in Cellular Processes during Ageing", year: 2020, identifier: "PMID: 32130985", authors: "Covarrubias AJ, Perrone R, Grozio A, Verdin E", url: "https://pubmed.ncbi.nlm.nih.gov/32130985/" },
    { journal: "WIKIPEDIA", title: "Nicotinamide adenine dinucleotide", url: "https://en.wikipedia.org/wiki/Nicotinamide_adenine_dinucleotide" },
    { journal: "PUBCHEM", title: "NAD+ — CID 5893", identifier: "CID 5893", url: "https://pubchem.ncbi.nlm.nih.gov/compound/5893" },
  ],
  "HCG": [
    { journal: "ENDOCR REV", title: "Human Chorionic Gonadotropin: Biological Functions and Clinical Applications", year: 2017, identifier: "PMC5666719", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5666719/" },
    { journal: "WIKIPEDIA", title: "Human chorionic gonadotropin", url: "https://en.wikipedia.org/wiki/Human_chorionic_gonadotropin" },
  ],
  "GLOW": [
    { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", authors: "BPC-157 component", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
    { journal: "BIOMEDICINES", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "BPC-157 component · Sikiric P et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
    { journal: "BIOMED RES INT", title: "GHK-Cu may prevent oxidative stress in skin by regulating copper and modifying expression of numerous antioxidant genes", year: 2014, identifier: "PMID: 25196481", authors: "GHK-Cu component · Pickart L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25196481/" },
    { journal: "INT J MOL SCI", title: "The Effect of the Human Peptide GHK on Gene Expression Relevant to Nervous System Function and Cognitive Decline", year: 2017, identifier: "PMID: 28604617", authors: "GHK-Cu component · Pickart L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/28604617/" },
    { journal: "ANN N Y ACAD SCI", title: "Thymosin β4 and tissue repair: the actin-sequestering peptide that regulates cell migration and wound healing", year: 2010, identifier: "PMID: 20536557", authors: "TB-500 component · Goldstein AL et al.", url: "https://pubmed.ncbi.nlm.nih.gov/20536557/" },
    { journal: "EXPERT OPIN BIOL THER", title: "Thymosin β4 in clinical trials — a critical evaluation", year: 2018, identifier: "PMID: 30130414", authors: "TB-500 component", url: "https://pubmed.ncbi.nlm.nih.gov/30130414/" },
  ],
  "KLOW": [
    { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", authors: "BPC-157 component", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
    { journal: "BIOMEDICINES", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "BPC-157 component · Sikiric P et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
    { journal: "BIOMED RES INT", title: "GHK-Cu may prevent oxidative stress in skin by regulating copper and modifying expression of numerous antioxidant genes", year: 2014, identifier: "PMID: 25196481", authors: "GHK-Cu component · Pickart L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25196481/" },
    { journal: "ANN N Y ACAD SCI", title: "Thymosin β4 and tissue repair: the actin-sequestering peptide that regulates cell migration and wound healing", year: 2010, identifier: "PMID: 20536557", authors: "TB-500 component · Goldstein AL et al.", url: "https://pubmed.ncbi.nlm.nih.gov/20536557/" },
    { journal: "PEPTIDES", title: "α-MSH-derived tripeptide KPV exerts anti-inflammatory effects via the melanocortin pathway", year: 2003, identifier: "PMID: 12676251", authors: "KPV component", url: "https://pubmed.ncbi.nlm.nih.gov/12676251/" },
    { journal: "FASEB J", title: "The tripeptide KPV (Lys-Pro-Val) reduces inflammation in models of colitis", year: 2010, identifier: "PMID: 20736340", authors: "KPV component", url: "https://pubmed.ncbi.nlm.nih.gov/20736340/" },
  ],
};

function getMolecularProfile(productName) {
  return MOLECULAR_PROFILES[productName] || null;
}

function getReferences(productName) {
  return REFERENCES[productName] || null;
}

// ─── Research Articles ────────────────────────────────────────────────────────
// Long-form research review articles, keyed by URL slug. Adding a new article =
// adding a new entry to this array. Each `content` is a function returning JSX
// so we can keep articles readable inline.
const ARTICLES = [
  {
    slug: "bpc-157-mechanism-of-action",
    title: "BPC-157: Mechanism of Action and Research Applications",
    excerpt: "An evidence-based research review of BPC-157 — its discovery, molecular structure, proposed mechanisms of action, and the major findings across musculoskeletal, gastrointestinal, and neurological applications.",
    date: "2026-06-27",
    author: "Tier One Research Team",
    tags: ["BPC-157", "Recovery", "Mechanism"],
    readingTimeMinutes: 9,
    heroImage: "/bpc157-10.jpg",
    metaTitle: "BPC-157 Mechanism of Action: Research Review (2026)",
    metaDescription: "Evidence-based research review of BPC-157 covering its discovery, molecular structure, proposed mechanisms (angiogenesis, nitric oxide, growth hormone receptor), and applications in musculoskeletal, gastrointestinal, and neurological research models.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>BPC-157 is a synthetic 15-amino-acid peptide derived from a protective protein found in human gastric juice.</li>
        <li>Preclinical research suggests it promotes angiogenesis, modulates the nitric oxide system, and accelerates tissue repair.</li>
        <li>The strongest body of evidence is in musculoskeletal models (tendon, ligament, muscle) and gastrointestinal protection.</li>
        <li>BPC-157 demonstrates a notably favorable safety profile in animal toxicology studies, but it is not approved by the FDA or other major regulatory bodies for human therapeutic use.</li>
      </ul>

      <h2>What Is BPC-157?</h2>
      <p>BPC-157 — short for <strong>Body Protection Compound-157</strong> — is a synthetic pentadecapeptide (a chain of 15 amino acids) derived from a fragment of a larger protective protein originally identified in human gastric juice. The peptide was first characterized by Croatian researcher Predrag Sikiric and colleagues in 1993, and the three decades since have produced an extensive (if predominantly preclinical) body of research investigating its biological effects.</p>
      <p>The full amino acid sequence is <strong>Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val</strong>, with a molecular weight of approximately 1,419.55 g/mol and the molecular formula C₆₂H₉₈N₁₆O₂₂. Unlike many therapeutic peptides, BPC-157 demonstrates unusual stability in both aqueous solutions and gastric acid, which has made it a subject of interest for researchers investigating both oral and parenteral administration routes.</p>
      <p><em>In plain terms:</em> BPC-157 is a small protein-like molecule originally isolated from the stomach. Researchers believe the body produces it (in larger precursor forms) as part of a tissue-protective defense system, which is where the name "body protection compound" comes from.</p>

      <h2>Proposed Mechanisms of Action</h2>
      <p>BPC-157's mechanism of action remains incompletely characterized, but preclinical research has identified several distinct pathways through which it appears to produce its biological effects. The convergent evidence across studies suggests a multi-pathway mechanism rather than a single receptor target — a profile consistent with its broad range of reported effects across organ systems.</p>

      <h3>Angiogenesis and the VEGF Pathway</h3>
      <p>One of the most consistent findings across BPC-157 research is the upregulation of <strong>vascular endothelial growth factor receptor 2 (VEGFR2)</strong> expression on endothelial cells. VEGF and its receptors are central to angiogenesis — the formation of new blood vessels from existing vasculature. Enhanced angiogenesis at injury sites accelerates oxygen and nutrient delivery to regenerating tissue, which appears to be a major factor in BPC-157's reported wound-healing effects across multiple tissue types.</p>

      <h3>Nitric Oxide System Modulation</h3>
      <p>BPC-157 appears to modulate the <strong>nitric oxide (NO) system</strong> through multiple parallel mechanisms. In studies using L-NAME (a nitric oxide synthase inhibitor) and L-arginine (a NO precursor), BPC-157 administration restores normal NO-dependent vascular and gastrointestinal function. This has implications across cardiovascular, gastrointestinal, and wound-healing contexts where NO signaling is rate-limiting for repair processes.</p>

      <h3>Growth Hormone Receptor Upregulation</h3>
      <p>Preclinical work suggests BPC-157 <strong>upregulates growth hormone receptor expression</strong> in fibroblasts and other repair-active cell populations. This effect sensitizes target tissues to circulating growth hormone, providing one explanation for the synergy researchers have observed when BPC-157 is studied alongside growth-hormone-stimulating peptides.</p>

      <h3>Dopaminergic and Serotonergic Modulation</h3>
      <p>Animal studies have documented BPC-157's interactions with both <strong>dopaminergic and serotonergic systems</strong> in the central nervous system. This has driven research interest in neurological models, including traumatic brain injury, cuprizone-induced demyelination paradigms, and various behavioral models of depression and anxiety.</p>

      <h2>Research Applications</h2>

      <h3>Musculoskeletal: Tendon, Ligament, and Muscle Repair</h3>
      <p>The largest single body of BPC-157 research is in <strong>musculoskeletal tissue repair models</strong>. Studies in rats demonstrate accelerated healing of transected Achilles tendons, with measurably increased tensile strength, faster fibroblast outgrowth, and improved collagen organization compared to controls. Similar findings have been reported in medial collateral ligament transection models and in crushed-muscle injury paradigms. The effect appears robust across multiple research groups and administration routes.</p>

      <h3>Gastrointestinal Protection</h3>
      <p>Given BPC-157's origin in gastric juice, much of the earliest research focused on <strong>gastrointestinal applications</strong>. Multiple studies have demonstrated protective effects against NSAID-induced gastric ulceration, alcohol-induced gastric lesions, and various models of inflammatory bowel disease. The proposed mechanism involves preservation of GI mucosal blood flow, modulation of the gut microbiome composition, and direct cytoprotective effects on intestinal epithelial cells.</p>

      <h3>Neuroprotection</h3>
      <p>Preclinical research has investigated BPC-157 in models of <strong>traumatic brain injury, spinal cord injury, and various neurodegenerative paradigms</strong>. Reported outcomes have included reduced lesion volumes, improved functional recovery scores, and modulation of neuroinflammatory marker expression. The peptide appears to cross the blood-brain barrier, though the extent and mechanism of CNS penetration are still being characterized.</p>

      <h3>Cardiovascular Research</h3>
      <p>Animal studies have examined BPC-157 in models of myocardial infarction, vascular occlusion, and various forms of vasculopathy. Findings include preserved cardiac function, accelerated collateral vessel formation, and protection against ischemia-reperfusion injury — broadly consistent with the peptide's apparent effects on angiogenesis and NO signaling.</p>

      <h2>BPC-157 in Research Settings</h2>
      <p>Research-grade BPC-157 is supplied as a lyophilized (freeze-dried) powder in glass vials for laboratory reconstitution. Reconstitution is most commonly performed with bacteriostatic water for injection, with reconstituted solutions stored under refrigeration. Lyophilized powder remains stable for extended periods under standard freezer conditions away from light and moisture.</p>
      <p>Detailed handling, reconstitution, and storage information specific to our research-grade BPC-157 — including third-party Certificate of Analysis data — is available on the product pages linked below.</p>

      <h2>Safety and Regulatory Status</h2>
      <p>In animal toxicology studies, BPC-157 has demonstrated a notably <strong>favorable safety profile</strong>, with no LD50 having been established at tested doses and minimal reported off-target effects. Human safety data remain limited, however, and the peptide has not been approved by the FDA, EMA, or any other major regulatory body for therapeutic use.</p>
      <p>BPC-157 is included on the <strong>World Anti-Doping Agency (WADA) Prohibited List</strong>, classified as a non-approved substance under category S0. Researchers working with BPC-157 should be aware of the regulatory landscape in their jurisdiction.</p>

      <h2>Conclusion</h2>
      <p>BPC-157 represents one of the most thoroughly characterized synthetic peptides in the preclinical research space. The convergent evidence across angiogenesis, nitric oxide signaling, growth hormone receptor sensitization, and tissue repair models points to a multi-pathway mechanism that may explain the wide range of physiological systems in which it has demonstrated activity. Continued translational research will be needed to establish whether preclinical findings extend reliably to human applications.</p>
    </>),
    references: [
      { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
      { journal: "BIOMEDICINES", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "Sikiric P et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
      { journal: "PHARMACEUTICS", title: "BPC-157 as an Investigational Peptide Therapeutic: Biopharmaceutical Challenges, Formulation Strategies, and Translational Development Barriers", year: 2025, identifier: "DOI: 10.3390/pharmaceutics18050625", url: "https://doi.org/10.3390/pharmaceutics18050625" },
      { journal: "NEUROPEPTIDES", title: "Concerning BPC-157, a natural pentadecapeptide, that acts as a cytoprotectant", year: 2024, identifier: "PMID: 40759852", url: "https://pubmed.ncbi.nlm.nih.gov/40759852/" },
      { journal: "INT. J. MOL. SCI.", title: "Protective Effects of BPC 157 on Liver, Kidney, and Lung Distant Organ Damage in Rats with Experimental Ischemia–Reperfusion Injury", year: 2025, identifier: "PMC11857380", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11857380/" },
      { journal: "PUBCHEM", title: "BPC-157 — CID 9941957", identifier: "CID 9941957", url: "https://pubchem.ncbi.nlm.nih.gov/compound/9941957" },
    ],
    relatedProductIds: ["bpc157-5", "bpc157-10"],
  },
  {
    slug: "retatrutide-vs-tirzepatide-vs-semaglutide",
    title: "Retatrutide vs Tirzepatide vs Semaglutide: A Research Comparison",
    excerpt: "An evidence-based comparison of the three leading incretin-based weight management compounds — covering mechanism (single, dual, and triple receptor agonism), reported efficacy in clinical research, and key safety findings.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["GLP-3RT", "Retatrutide", "Weight Management", "Comparison"],
    readingTimeMinutes: 11,
    heroImage: "/glp3rt-10.jpg",
    metaTitle: "Retatrutide vs Tirzepatide vs Semaglutide: Research Comparison (2026)",
    metaDescription: "Side-by-side research comparison of retatrutide (GLP-3RT), tirzepatide, and semaglutide — mechanism of action, reported weight loss percentages from published trials, comparative efficacy data, and safety profile across the three leading incretin receptor agonists.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li><strong>Semaglutide</strong> is a single-receptor agonist targeting GLP-1; phase 3 STEP trials reported mean weight loss around 15% from baseline in non-diabetic adults with obesity.</li>
        <li><strong>Tirzepatide</strong> is a dual GLP-1 / GIP receptor agonist; the SURMOUNT-1 trial reported mean weight loss of approximately 20.9% at the 15 mg dose.</li>
        <li><strong>Retatrutide (GLP-3RT)</strong> is a triple GLP-1 / GIP / glucagon receptor agonist; phase 2 data reported mean weight loss of approximately 24.2% at 48 weeks with the 12 mg dose — the highest efficacy reported for any incretin-based compound to date.</li>
        <li>Side effect profiles are broadly similar (predominantly gastrointestinal), but tolerability and rare events differ by compound and dose.</li>
      </ul>

      <h2>Background: The Incretin System</h2>
      <p>The incretin system refers to a group of gut-derived peptide hormones — primarily <strong>glucagon-like peptide-1 (GLP-1)</strong> and <strong>glucose-dependent insulinotropic polypeptide (GIP)</strong> — that amplify insulin secretion in response to food intake, slow gastric emptying, and modulate appetite signaling in the central nervous system. <strong>Glucagon</strong>, although classically opposed to insulin's actions, contributes to energy expenditure when activated peripherally.</p>
      <p>The therapeutic concept behind semaglutide, tirzepatide, and retatrutide is straightforward: pharmacologically mimicking and prolonging incretin signaling produces sustained reductions in appetite and body weight. The three compounds differ in how many of these receptors they engage simultaneously.</p>
      <p><em>In plain terms:</em> these three peptides all work by mimicking gut hormones that tell your brain you're full and your pancreas to release insulin. The difference is how many of those signals each one activates at once.</p>

      <h2>Semaglutide: The Single Agonist</h2>
      <p>Semaglutide is a GLP-1 receptor agonist with a 94% amino acid sequence homology to native GLP-1. It carries a fatty acid side chain that binds reversibly to serum albumin, extending its half-life to approximately one week and enabling once-weekly subcutaneous administration.</p>
      <p>In the <strong>STEP-1 trial</strong> (New England Journal of Medicine, 2021), adults with obesity but without diabetes who received 2.4 mg weekly semaglutide for 68 weeks lost an average of 14.9% of baseline body weight, compared to 2.4% in the placebo group. Subsequent STEP trials replicated these findings across populations including adolescents and adults with type 2 diabetes.</p>

      <h2>Tirzepatide: The Dual Agonist</h2>
      <p>Tirzepatide combines GLP-1 and GIP receptor activity in a single molecule. The GIP component is hypothesized to contribute additional weight-reducing effects through enhanced energy expenditure and adipocyte sensitivity, though the precise mechanism remains an active area of investigation.</p>
      <p>The <strong>SURMOUNT-1 trial</strong> (New England Journal of Medicine, 2022) reported mean weight loss of 15.0%, 19.5%, and 20.9% with the 5 mg, 10 mg, and 15 mg once-weekly doses respectively in non-diabetic adults with obesity at 72 weeks. Subsequent SURMOUNT trials (-2 through -5) extended these findings into type 2 diabetes, weight loss maintenance, obstructive sleep apnea, and intensive-lifestyle-program populations.</p>

      <h2>Retatrutide (GLP-3RT): The Triple Agonist</h2>
      <p>Retatrutide adds glucagon receptor activity to the GLP-1 / GIP combination. The glucagon component is thought to contribute weight reduction through increased basal energy expenditure and hepatic fatty acid oxidation, partially offsetting the appetite-driven mechanism shared with the other two compounds.</p>
      <p>The <strong>retatrutide phase 2 obesity trial</strong> (Jastreboff et al., New England Journal of Medicine, 2023) reported mean weight loss percentages of 8.7%, 17.1%, 22.8%, and 24.2% at the 1, 4, 8, and 12 mg once-weekly doses respectively after 48 weeks of treatment — the largest reductions reported for any single-agent incretin therapy to date. A separate phase 2 trial in type 2 diabetes (Rosenstock et al., The Lancet, 2023) demonstrated robust glycemic improvements alongside the weight loss.</p>
      <p>More recently, a <strong>coadministration study</strong> (Garvey et al., New England Journal of Medicine, 2025) examined retatrutide combined with semaglutide and reported additional weight-loss benefits compared with either monotherapy.</p>

      <h2>Head-to-Head Considerations</h2>

      <h3>Efficacy Ranking</h3>
      <p>Based on currently published trials, the rank order of mean reported weight loss at maximum-tolerated doses is: <strong>Retatrutide (~24%) &gt; Tirzepatide (~21%) &gt; Semaglutide (~15%)</strong>. Direct head-to-head trials between the three are limited; rankings rely on cross-trial comparison, which can be confounded by population, trial duration, and baseline characteristics.</p>

      <h3>Mechanism Complexity</h3>
      <p>The compounds reflect a clear evolution in receptor engagement: semaglutide (single) → tirzepatide (dual) → retatrutide (triple). Each additional receptor introduces both potential efficacy gain and potential off-target effects.</p>

      <h3>Safety and Tolerability</h3>
      <p>Across all three compounds, the most commonly reported adverse events in clinical research are gastrointestinal — nausea, diarrhea, constipation, and vomiting — typically dose-related and most prominent during titration. Discontinuation rates from adverse events have generally been in the single digits in published trials. Less common but more serious events have included gallbladder disease, pancreatitis, and (with the FDA's class-wide warning) thyroid C-cell hyperplasia in rodent models. Retatrutide's glucagon receptor activity has additionally been associated with modest increases in heart rate and, in some participants, transient blood-pressure changes.</p>

      <h2>Conclusion</h2>
      <p>The progression from semaglutide to tirzepatide to retatrutide reflects a stepwise expansion of incretin-system pharmacology. Retatrutide currently leads on reported efficacy, but published human data remain phase 2-level; phase 3 readouts and longer-term safety data will be required to fully position it against tirzepatide and semaglutide. For researchers and clinicians, the three compounds offer overlapping but distinguishable tools for studying body composition, glycemic control, and energy metabolism.</p>
    </>),
    references: [
      { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Triple–Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial", year: 2023, identifier: "DOI: 10.1056/NEJMoa2301972", authors: "Jastreboff AM et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2301972" },
      { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Coadministered Retatrutide and Semaglutide in Adults with Overweight or Obesity", year: 2025, identifier: "DOI: 10.1056/NEJMoa2502081", authors: "Garvey WT et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2502081" },
      { journal: "THE LANCET", title: "Retatrutide, a GIP/GLP-1/glucagon receptor agonist, for people with type 2 diabetes: a randomised, double-blind, placebo and active-controlled, phase 2 trial", year: 2023, identifier: "DOI: 10.1016/S0140-6736(23)01053-X", authors: "Rosenstock J et al.", url: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(23)01053-X/fulltext" },
      { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Tirzepatide Once Weekly for the Treatment of Obesity (SURMOUNT-1)", year: 2022, identifier: "DOI: 10.1056/NEJMoa2206038", authors: "Jastreboff AM et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2206038" },
      { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Once-Weekly Semaglutide in Adults with Overweight or Obesity (STEP-1)", year: 2021, identifier: "DOI: 10.1056/NEJMoa2032183", authors: "Wilding JPH et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2032183" },
      { journal: "WIKIPEDIA", title: "Retatrutide", url: "https://en.wikipedia.org/wiki/Retatrutide" },
    ],
    relatedProductIds: ["glp3rt-5", "glp3rt-10", "glp3rt-20", "glp3rt-30"],
  },
  {
    slug: "ghk-cu-copper-peptide-research",
    title: "GHK-Cu Copper Peptide: Research Overview and Mechanisms",
    excerpt: "An evidence-based overview of GHK-Cu — the naturally occurring copper-binding tripeptide. Covers its mechanism via gene expression modulation, applications in skin, hair, and wound healing research, and the most-cited published studies.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["GHK-Cu", "Longevity", "Skin", "Mechanism"],
    readingTimeMinutes: 9,
    heroImage: "/ghkcu-100.jpg",
    metaTitle: "GHK-Cu Copper Peptide: Research, Mechanism & Applications (2026)",
    metaDescription: "Comprehensive research review of GHK-Cu (copper tripeptide-1) covering its mechanism of action, gene expression effects, applications in skin regeneration, hair growth, wound healing, and the peer-reviewed studies behind it.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>GHK-Cu is a naturally occurring tripeptide (Gly-His-Lys) coordinated with a copper(II) ion.</li>
        <li>It modulates the expression of over 4,000 human genes — one of the broadest gene-regulatory profiles documented for any small peptide.</li>
        <li>Research applications span skin regeneration, hair growth, wound healing, and anti-inflammatory effects.</li>
        <li>Endogenous GHK-Cu levels decline significantly with age, which has driven interest in supplementation research.</li>
      </ul>

      <h2>What Is GHK-Cu?</h2>
      <p><strong>GHK-Cu</strong> — also known as <strong>Copper Tripeptide-1</strong> — is a small peptide consisting of three amino acids (Glycine-Histidine-Lysine) bound to a copper(II) ion. The peptide was first isolated from human plasma in 1973 by Loren Pickart, who observed that albumin from younger donors stimulated tissue regeneration in liver cell cultures while albumin from older donors did not. The active component was identified as GHK, which binds copper with high affinity to form the GHK-Cu complex.</p>
      <p>The molecular weight of the Cu²⁺ complex is approximately 403.9 g/mol, with molecular formula C₁₄H₂₂CuN₆O₄. Unlike free copper (which can be cytotoxic), GHK-Cu delivers copper into cells in a controlled, physiologically active form.</p>
      <p><em>In plain terms:</em> GHK-Cu is a tiny three-amino-acid molecule paired with a copper atom. It naturally circulates in your blood, but levels drop substantially as you age — and research suggests restoring it has wide-ranging regenerative effects.</p>

      <h2>Mechanism of Action: Gene Expression Modulation</h2>
      <p>The defining characteristic of GHK-Cu is its remarkably broad effect on gene expression. A landmark 2010 study using the Broad Institute's Connectivity Map database identified GHK as one of the most potent gene-expression-modulating molecules ever profiled, affecting the expression of <strong>4,192 human genes</strong> at concentrations as low as 1 nanomolar. The pattern of modulation broadly favored "youthful" gene expression — upregulating DNA repair, stem cell maintenance, and tissue remodeling pathways while downregulating inflammatory and oncogenic ones.</p>
      <p>The molecular mechanism behind this breadth is still being characterized, but appears to involve copper delivery to enzymes and transcription factors, modulation of antioxidant defenses (notably SOD activity), and direct interactions with extracellular matrix components.</p>

      <h2>Research Applications</h2>

      <h3>Skin Regeneration and Collagen Synthesis</h3>
      <p>The largest body of GHK-Cu research focuses on <strong>skin</strong>. Published studies have documented increased synthesis of collagen, elastin, glycosaminoglycans, and proteoglycans in dermal fibroblast cultures exposed to GHK-Cu. Human clinical research has examined improvements in skin density, elasticity, fine line depth, and barrier function with topical GHK-Cu formulations — though formulation and delivery vehicle vary widely across studies.</p>

      <h3>Wound Healing</h3>
      <p>GHK-Cu was originally noted for its <strong>wound healing</strong> effects. Animal studies have documented accelerated closure of incisional and excisional wounds, with histological evidence of better-organized collagen deposition and faster re-epithelialization. The mechanism appears to involve both direct stimulation of fibroblast and keratinocyte activity and recruitment of repair cells to the wound site.</p>

      <h3>Hair Growth Research</h3>
      <p>Research on GHK-Cu and <strong>hair follicles</strong> has demonstrated stimulation of dermal papilla cell proliferation, enlargement of follicles, and prolongation of the anagen (growth) phase. The compound is occasionally combined with other hair-research compounds in formulation studies.</p>

      <h3>Cognitive and Neurological Research</h3>
      <p>A 2017 analysis by Pickart and colleagues in the International Journal of Molecular Sciences identified GHK's effects on genes relevant to <strong>nervous system function and cognitive decline</strong> — including those involved in neurotrophin signaling, synaptic plasticity, and neurogenesis. This has driven follow-on research into GHK-Cu's potential in models of cognitive aging and neuroprotection.</p>

      <h3>Anti-Inflammatory Effects</h3>
      <p>GHK-Cu modulates expression of multiple inflammatory pathway genes, including downregulation of TNF-α, IL-6, and NF-κB signaling components. Animal models of acute and chronic inflammation have demonstrated reduced inflammatory infiltrate and faster resolution with GHK-Cu administration.</p>

      <h2>Safety and Aging-Related Decline</h2>
      <p>Endogenous GHK levels in plasma decline substantially with age — from approximately 200 ng/mL at age 20 to roughly 80 ng/mL by age 60. This natural decline has been hypothesized to contribute to age-related deterioration in tissue repair capacity, providing the rationale for exogenous supplementation research.</p>
      <p>Safety data from animal toxicology and human topical studies suggest a favorable profile, with no significant adverse effects reported at typical research doses. As with all copper-containing compounds, dosing exceeding physiological copper requirements would not be expected to confer benefit and could theoretically cause copper-related toxicity.</p>

      <h2>Conclusion</h2>
      <p>GHK-Cu's exceptionally broad gene expression effects, paired with its endogenous status and well-characterized age-related decline, have made it one of the most thoroughly studied small peptides in regenerative biology. The research base spans skin, hair, wound, and neurological domains and continues to expand. For researchers working on tissue regeneration, aging biology, or copper-dependent enzymatic processes, GHK-Cu represents a well-characterized and commercially accessible tool compound.</p>
    </>),
    references: [
      { journal: "BIOMED RES INT", title: "GHK-Cu may prevent oxidative stress in skin by regulating copper and modifying expression of numerous antioxidant genes", year: 2014, identifier: "PMID: 25196481", authors: "Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://pubmed.ncbi.nlm.nih.gov/25196481/" },
      { journal: "INT J MOL SCI", title: "The Effect of the Human Peptide GHK on Gene Expression Relevant to Nervous System Function and Cognitive Decline", year: 2017, identifier: "PMID: 28604617", authors: "Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://pubmed.ncbi.nlm.nih.gov/28604617/" },
      { journal: "FASEB J", title: "Identification of a peptide for liver regeneration: glycyl-l-histidyl-l-lysine", year: 1973, identifier: "Pickart L, Thaler MM", url: "https://pubmed.ncbi.nlm.nih.gov/4719927/" },
      { journal: "WIKIPEDIA", title: "Copper peptide GHK-Cu", url: "https://en.wikipedia.org/wiki/Copper_peptide_GHK-Cu" },
      { journal: "PUBCHEM", title: "GHK-Cu Copper Tripeptide — CID 73587", identifier: "CID 73587", url: "https://pubchem.ncbi.nlm.nih.gov/compound/73587" },
    ],
    relatedProductIds: ["ghkcu-50", "ghkcu-100"],
  },
  {
    slug: "tesamorelin-growth-hormone-research",
    title: "Tesamorelin and Growth Hormone Research: Mechanism and Findings",
    excerpt: "An evidence-based research review of tesamorelin — a synthetic GHRH analog approved for HIV-associated lipodystrophy. Covers its mechanism, pituitary axis effects, published clinical findings, and comparison with other GH-stimulating peptides.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["Tesamorelin", "Growth Hormone", "Mechanism"],
    readingTimeMinutes: 8,
    heroImage: "/tesamorelin.jpg",
    metaTitle: "Tesamorelin Research: GHRH Analog Mechanism & Findings (2026)",
    metaDescription: "Research review of tesamorelin — synthetic growth hormone-releasing hormone (GHRH) analog. Covers mechanism of action, pituitary GH/IGF-1 axis effects, published clinical trial findings, and comparison with sermorelin, CJC-1295, and ipamorelin.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>Tesamorelin is a synthetic analog of growth hormone-releasing hormone (GHRH) with an N-terminal modification that extends its half-life.</li>
        <li>It is the only FDA-approved GHRH analog (approved for HIV-associated lipodystrophy in 2010).</li>
        <li>Mechanism: stimulates the pituitary to secrete growth hormone in a pulsatile, physiological manner, which in turn elevates IGF-1.</li>
        <li>Research applications extend beyond its approved indication to body composition, cognition, and metabolic research.</li>
      </ul>

      <h2>What Is Tesamorelin?</h2>
      <p><strong>Tesamorelin</strong> is a synthetic 44-amino-acid peptide structurally based on the endogenous hypothalamic peptide <strong>growth hormone-releasing hormone (GHRH)</strong>. The key structural modification — addition of a <em>trans</em>-3-hexenoyl group to the N-terminal tyrosine — confers resistance to enzymatic degradation by dipeptidyl peptidase-4 (DPP-4), substantially extending its biological half-life compared to native GHRH.</p>
      <p>The peptide carries a molecular weight of approximately 5,135.9 g/mol (free base; ~5,196 g/mol as the acetate salt typically supplied for research) with the molecular formula C₂₂₁H₃₆₆N₇₂O₆₇S. It is supplied as a lyophilized powder for laboratory reconstitution.</p>
      <p><em>In plain terms:</em> Tesamorelin is a modified copy of a natural brain hormone that tells the pituitary gland to release growth hormone. The modification just makes the body break it down slower than the natural version.</p>

      <h2>Mechanism of Action: The GH/IGF-1 Axis</h2>
      <p>Tesamorelin binds to GHRH receptors on the anterior pituitary, stimulating the release of <strong>growth hormone (GH)</strong>. The released GH then circulates and induces hepatic production of <strong>insulin-like growth factor 1 (IGF-1)</strong>, the primary mediator of most of GH's downstream effects on tissue.</p>
      <p>Critically, tesamorelin's mechanism preserves the body's natural pulsatile pattern of GH release and the normal negative feedback regulation of the GH/IGF-1 axis. This distinguishes it from direct GH administration, which produces sustained supraphysiological GH levels and can suppress the body's own GH production.</p>

      <h2>Research Applications</h2>

      <h3>HIV-Associated Lipodystrophy (Approved Indication)</h3>
      <p>Tesamorelin's FDA approval came from the pivotal clinical trials reported by <strong>Falutz et al. (New England Journal of Medicine, 2007)</strong>, which demonstrated significant reductions in <strong>visceral adipose tissue (VAT)</strong> in HIV-positive patients with abnormal abdominal fat accumulation. The 2 mg daily subcutaneous regimen produced approximately 15-18% reductions in VAT over 26 weeks compared to placebo.</p>
      <p>Follow-up safety and durability studies have generally supported the original findings, with the visceral fat reduction effect maintained on continued treatment and gradually reversing on discontinuation.</p>

      <h3>Body Composition Research</h3>
      <p>Beyond the HIV-specific indication, tesamorelin has been studied in research contexts examining visceral adiposity in metabolic syndrome, non-alcoholic fatty liver disease (NAFLD), and age-related body composition changes. Published findings have suggested benefits to visceral fat reduction and lipid profile improvements consistent with the GH/IGF-1 mechanism.</p>

      <h3>Cognitive Research</h3>
      <p>Smaller exploratory research has examined tesamorelin's effects on cognition in older adults and in HIV-positive individuals with neurocognitive complaints. GH and IGF-1 signaling both have established roles in synaptic plasticity and neuronal maintenance, providing biological plausibility for cognitive research applications.</p>

      <h2>Comparison with Other GH-Stimulating Peptides</h2>
      <p>Several other peptides target the GH/IGF-1 axis through related but distinct mechanisms:</p>
      <ul>
        <li><strong>Sermorelin</strong> — the unmodified GHRH(1-29) fragment. Active but very short half-life (~10 minutes).</li>
        <li><strong>CJC-1295</strong> — also a GHRH analog. The "no-DAC" version (Mod GRF 1-29) has a similar profile to sermorelin; the "with-DAC" version uses an albumin-binding tail for week-long half-life.</li>
        <li><strong>Ipamorelin, GHRP-2, GHRP-6, Hexarelin</strong> — growth hormone secretagogues acting on the ghrelin receptor rather than GHRH receptor. Often combined with GHRH analogs for synergistic GH release.</li>
        <li><strong>Tesamorelin</strong> — uniquely combines GHRH receptor specificity, extended half-life, and FDA-approved efficacy data.</li>
      </ul>

      <h2>Safety Considerations</h2>
      <p>The most commonly reported adverse events in tesamorelin clinical trials are injection-site reactions, myalgia, and modest elevations in IGF-1 (typically within or just above the normal range). Less common events have included peripheral edema, paresthesia, and rare glucose intolerance attributable to GH's counter-regulatory effect on insulin. The safety profile in approved populations is generally considered favorable.</p>

      <h2>Conclusion</h2>
      <p>Tesamorelin occupies a unique position among GH-stimulating peptides: it is the only GHRH analog with FDA approval, the only one supported by phase 3 trial data in its primary indication, and one of the most thoroughly characterized peptides in the GH/IGF-1 axis. For researchers working on visceral adiposity, GH pulsatility, or IGF-1-mediated processes, tesamorelin offers a well-defined and clinically validated research tool.</p>
    </>),
    references: [
      { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Effects of Tesamorelin (TH9507), a Growth Hormone-Releasing Factor Analog, in HIV-Infected Patients with Excess Abdominal Fat", year: 2007, identifier: "DOI: 10.1056/NEJMoa073538", authors: "Falutz J et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa073538" },
      { journal: "JCEM", title: "Long-term safety and effects of tesamorelin, a growth hormone-releasing factor analog, in HIV patients with abdominal fat accumulation", year: 2008, identifier: "PMID: 18583464", url: "https://pubmed.ncbi.nlm.nih.gov/18583464/" },
      { journal: "JCEM", title: "Effects of tesamorelin on non-alcoholic fatty liver disease in HIV", year: 2019, identifier: "PMID: 30649409", url: "https://pubmed.ncbi.nlm.nih.gov/30649409/" },
      { journal: "WIKIPEDIA", title: "Tesamorelin", url: "https://en.wikipedia.org/wiki/Tesamorelin" },
      { journal: "PUBCHEM", title: "Tesamorelin Acetate — CID 16159350", identifier: "CID 16159350", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16159350" },
    ],
    relatedProductIds: ["tesamorelin"],
  },
  {
    slug: "reconstituting-storing-research-peptides",
    title: "How to Properly Reconstitute and Store Research Peptides",
    excerpt: "A practical guide to reconstituting and storing lyophilized research peptides — what bacteriostatic water is, step-by-step reconstitution, calculating concentration, storage best practices, and compound-specific stability notes.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["Education", "Reconstitution", "Storage", "Practical Guide"],
    readingTimeMinutes: 10,
    heroImage: "/bpc157-10.jpg",
    metaTitle: "How to Reconstitute & Store Research Peptides: Complete Guide (2026)",
    metaDescription: "Practical step-by-step guide to reconstituting lyophilized research peptides with bacteriostatic water. Covers concentration calculation, storage best practices for frozen and refrigerated forms, stability windows, and compound-specific notes.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>Research peptides are supplied as <strong>lyophilized (freeze-dried) powder</strong> for maximum stability during shipping and storage.</li>
        <li>Reconstitution is most commonly done with <strong>bacteriostatic water for injection</strong> (BAC water) — sterile water containing 0.9% benzyl alcohol as a preservative.</li>
        <li>Store lyophilized vials in a standard freezer (0°F / -18°C) away from light; store reconstituted solutions refrigerated (35–46°F / 2–8°C).</li>
        <li>Most reconstituted peptides remain stable for 2–6 weeks under proper refrigeration, with specific windows varying by compound.</li>
      </ul>

      <h2>Why Reconstitution Is Necessary</h2>
      <p>Research peptides are shipped and stored as <strong>lyophilized powder</strong> — water has been removed from the solution through freeze-drying. Lyophilization stabilizes peptides for long-term storage at standard freezer temperatures and eliminates the risk of hydrolytic degradation that liquid-state peptides face during shipping and handling.</p>
      <p>To prepare the peptide for laboratory use, the powder must be redissolved in an appropriate aqueous solvent — a process called <strong>reconstitution</strong>.</p>

      <h2>Bacteriostatic Water for Injection (BAC Water)</h2>
      <p><strong>Bacteriostatic water for injection</strong> (commonly abbreviated <strong>BAC water</strong> or <strong>BWFI</strong>) is sterile water containing 0.9% benzyl alcohol as a bacteriostatic preservative. The preservative prevents microbial growth in the reconstituted solution, allowing multiple withdrawals from the same vial over the storage life of the reconstituted peptide.</p>
      <p>Plain sterile water for injection (without preservative) can also be used but should generally be limited to single-use scenarios because it offers no antimicrobial protection once the vial is breached.</p>
      <p><em>Compatibility note:</em> a small number of peptides are reported to have stability issues with benzyl alcohol. Where this is a concern, the supplier's reconstitution recommendation should be followed. For peptides supplied at very acidic or basic isoelectric points, alternative solvents (such as 0.1M acetic acid for IGF-1 LR3) may be appropriate.</p>

      <h2>Step-by-Step Reconstitution</h2>
      <ol style={{ margin: "0 0 22px", paddingLeft: 22 }}>
        <li style={{ marginBottom: 8 }}>Allow both the peptide vial and the BAC water to reach room temperature. Cold vials can produce condensation on the stopper, increasing contamination risk.</li>
        <li style={{ marginBottom: 8 }}>Wipe the rubber stoppers of both vials with an alcohol prep pad.</li>
        <li style={{ marginBottom: 8 }}>Draw the desired volume of BAC water into a clean syringe.</li>
        <li style={{ marginBottom: 8 }}>Slowly inject the BAC water into the peptide vial. Angle the needle so the stream runs down the inside wall of the vial rather than directly onto the powder — this minimizes foaming and protects peptide integrity.</li>
        <li style={{ marginBottom: 8 }}>Do <strong>not</strong> shake the vial. Gently swirl or roll it between your palms until the powder is fully dissolved. Most peptides dissolve completely within 30–60 seconds. Larger peptides may take a few minutes.</li>
        <li style={{ marginBottom: 8 }}>Inspect the solution. It should be clear and colorless (the exception being copper peptides like GHK-Cu, which produce a characteristic blue solution). Cloudiness or visible particulates may indicate degradation or precipitation.</li>
        <li>Label the vial with the date of reconstitution and the resulting concentration.</li>
      </ol>

      <h2>Calculating Concentration</h2>
      <p>Concentration depends entirely on the amount of BAC water added. The formula is straightforward:</p>
      <p><strong>Concentration (mg/mL) = Peptide amount (mg) ÷ BAC water added (mL)</strong></p>
      <p>For example, reconstituting a 10 mg peptide vial with 2 mL of BAC water yields a concentration of 5 mg/mL. Most peptide dosing calculators (including the one at <a href="/calculator">tierone.bio/calculator</a>) handle these conversions automatically.</p>

      <h2>Storage Best Practices</h2>

      <h3>Pre-Reconstitution (Lyophilized Powder)</h3>
      <p>Store unopened, lyophilized vials in a <strong>standard home freezer at 0°F (-18°C)</strong> away from light. Most research peptides remain stable for 12–24 months under these conditions. Light-sensitive peptides (GHK-Cu, melanocortin analogs) benefit from additional protection from light — keeping vials in their original packaging or in an opaque container.</p>

      <h3>Post-Reconstitution (Liquid Solution)</h3>
      <p>Once reconstituted, store the solution <strong>refrigerated at 35–46°F (2–8°C)</strong>. Avoid the refrigerator door (greater temperature fluctuation) and store toward the back of a main shelf.</p>
      <p><strong>Avoid freezing reconstituted peptides</strong> unless a supplier's protocol specifically calls for it. Freeze-thaw cycles can cause peptide aggregation, loss of activity, and unpredictable dosing.</p>

      <h3>What to Avoid</h3>
      <ul>
        <li><strong>Direct light</strong> — particularly UV. Most peptides degrade faster with light exposure.</li>
        <li><strong>Heat</strong> — even brief exposure above room temperature accelerates degradation.</li>
        <li><strong>Vigorous shaking</strong> — mechanical agitation can cause peptide aggregation.</li>
        <li><strong>Repeated freeze-thaw</strong> — each cycle reduces potency unpredictably.</li>
      </ul>

      <h2>Compound-Specific Notes</h2>
      <p><strong>BPC-157:</strong> Unusually stable in aqueous solution. Reconstituted solutions typically remain stable for 4 weeks refrigerated.</p>
      <p><strong>GHK-Cu:</strong> Light-sensitive due to the copper coordination. Solutions appear blue and should be stored in dark or amber vials when possible. Use within 2 weeks of reconstitution.</p>
      <p><strong>Tesamorelin:</strong> The trans-3-hexenoyl modification provides some additional stability; reconstituted solutions remain stable for approximately 3 weeks refrigerated.</p>
      <p><strong>IGF-1 LR3:</strong> Reconstitution traditionally uses 0.1M acetic acid rather than BAC water due to solubility at neutral pH. Once reconstituted, use within 2 weeks. Refer to supplier-specific instructions.</p>
      <p><strong>HCG:</strong> Stable refrigerated for up to 30 days post-reconstitution. The supplied lyophilized HCG vials should themselves be refrigerated, not frozen.</p>

      <h2>Stability Windows: Quick Reference</h2>
      <p>Approximate post-reconstitution stability windows under proper refrigeration:</p>
      <ul>
        <li>BPC-157, TB-500, MOTS-c, Selank, Semax, Ipamorelin, CJC-1295: <strong>~4 weeks</strong></li>
        <li>GHK-Cu, IGF-1 LR3: <strong>~2 weeks</strong></li>
        <li>Tesamorelin, Kisspeptin: <strong>~3 weeks</strong></li>
        <li>Epitalon: <strong>~6 weeks</strong></li>
        <li>HCG: <strong>~30 days (refrigerated, not frozen)</strong></li>
      </ul>

      <h2>Conclusion</h2>
      <p>Proper reconstitution and storage are foundational to obtaining reliable research results with peptides. The protocols above represent standard practice across most research-grade peptide compounds; product-specific deviations should always follow the supplier's documentation. Our individual product pages list the specific storage and reconstitution recommendations for each compound in our catalog.</p>
    </>),
    references: [
      { journal: "INT J PHARM", title: "Lyophilization of pharmaceuticals: An overview", year: 2005, identifier: "PMID: 15978804", url: "https://pubmed.ncbi.nlm.nih.gov/15978804/" },
      { journal: "PHARM RES", title: "Long-term stability of peptide pharmaceutical solutions: implications for refrigerated and frozen storage", year: 2008, identifier: "PMID: 18204886", url: "https://pubmed.ncbi.nlm.nih.gov/18204886/" },
      { journal: "USP", title: "Bacteriostatic Water for Injection USP — Monograph", url: "https://www.uspnf.com/" },
    ],
    relatedProductIds: ["bpc157-10", "ghkcu-100", "tesamorelin", "igf1lr3"],
  },
  {
    slug: "thymosin-alpha-1-immune-research",
    title: "Thymosin Alpha-1 and Immune System Research",
    excerpt: "A research review of Thymosin Alpha-1 (Tα1) — the 28-amino-acid thymic peptide approved in over 35 countries as an immunomodulator. Covers its mechanism via TLR signaling, applications in immune research, and the major published findings.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["Thymosin Alpha 1", "Immune", "Mechanism"],
    readingTimeMinutes: 8,
    heroImage: "/ta1.jpg",
    metaTitle: "Thymosin Alpha-1 Research: Immune Modulation & Mechanism (2026)",
    metaDescription: "Research review of Thymosin Alpha-1 (Tα1, thymalfasin) — a 28-amino-acid thymic peptide. Covers TLR2/TLR9 mechanism, T-cell maturation effects, clinical research in hepatitis and immunocompromised populations, and global regulatory status.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>Thymosin Alpha-1 (Tα1) is a synthetic 28-amino-acid peptide identical to a polypeptide naturally produced by the thymus gland.</li>
        <li>Approved in over <strong>35 countries</strong> as <em>thymalfasin</em> for chronic hepatitis B, hepatitis C, and as an adjuvant in cancer chemotherapy.</li>
        <li>Mechanism: activates Toll-Like Receptors 2 and 9 on dendritic cells, modulating both innate and adaptive immunity.</li>
        <li>Has a notably favorable safety profile across decades of clinical research.</li>
      </ul>

      <h2>What Is Thymosin Alpha-1?</h2>
      <p><strong>Thymosin Alpha-1</strong> (Tα1) is a 28-amino-acid peptide first isolated and characterized by Allan Goldstein and colleagues in 1972 from calf thymus extracts. Its full sequence — Ac-Ser-Asp-Ala-Ala-Val-Asp-Thr-Ser-Ser-Glu-Ile-Thr-Thr-Lys-Asp-Leu-Lys-Glu-Lys-Lys-Glu-Val-Val-Glu-Glu-Ala-Glu-Asn — features N-terminal acetylation and a molecular weight of approximately 3,108 g/mol.</p>
      <p>The synthetic version is marketed pharmaceutically as <strong>thymalfasin</strong> (brand name Zadaxin) and is approved in more than 35 countries worldwide. Although not approved by the US FDA for a primary indication, it has received orphan drug designations and is widely used in research settings.</p>
      <p><em>In plain terms:</em> Thymosin Alpha-1 is a copy of a natural peptide that your thymus gland produces to help train and activate immune cells. It's been used clinically for decades in other countries to treat conditions where the immune system needs a boost.</p>

      <h2>Mechanism of Action</h2>

      <h3>Toll-Like Receptor Activation</h3>
      <p>The primary mechanism through which Tα1 exerts its immunomodulatory effects is activation of <strong>Toll-Like Receptor 2 (TLR2) and Toll-Like Receptor 9 (TLR9)</strong> on dendritic cells. These receptors are part of the pattern-recognition system that bridges innate and adaptive immunity. By activating them, Tα1 promotes dendritic cell maturation, antigen presentation, and downstream T-cell activation.</p>

      <h3>T-Cell Maturation and Differentiation</h3>
      <p>Consistent with its thymic origin, Tα1 promotes the differentiation and maturation of T-lymphocyte precursors. Published research has documented enhanced CD4+ helper T-cell production, increased natural killer (NK) cell activity, and improved Th1 cytokine responses (IFN-γ, IL-2) — a profile favoring cell-mediated immunity over humoral immunity.</p>

      <h3>Cytokine Modulation</h3>
      <p>Tα1 modulates production of multiple cytokines, generally favoring antiviral and anti-tumor immune responses. It also appears to dampen inflammatory cytokine overproduction in scenarios characterized by immune dysregulation, suggesting a balancing rather than purely stimulatory role.</p>

      <h2>Research Applications</h2>

      <h3>Chronic Viral Hepatitis</h3>
      <p>The largest body of clinical research is in <strong>chronic hepatitis B (HBV) and chronic hepatitis C (HCV)</strong>. Multiple controlled trials have examined Tα1 as monotherapy and in combination with interferon or direct-acting antivirals, with consistent findings of improved viral suppression, ALT normalization, and HBeAg/HBV-DNA loss rates compared to control regimens.</p>

      <h3>Immunocompromised Populations</h3>
      <p>Tα1 has been studied in patients with chemotherapy-induced immunosuppression, HIV-associated immune dysfunction, and certain congenital immunodeficiencies. Outcomes have included improved CD4+ counts, reduced opportunistic infection rates, and better tolerance of cytotoxic therapy.</p>

      <h3>Cancer Adjuvant Research</h3>
      <p>As an adjuvant to standard cancer treatment, Tα1 has been examined in hepatocellular carcinoma, melanoma, non-small cell lung cancer, and several others. The proposed mechanism involves restoration of dendritic cell function (often suppressed in tumor microenvironments) and enhancement of T-cell anti-tumor responses.</p>

      <h3>Sepsis and Severe Infection</h3>
      <p>Research has examined Tα1 in severe sepsis and septic shock, where immune dysregulation contributes substantially to mortality. Some studies have suggested mortality benefit with Tα1 adjunctive therapy, though the evidence base remains heterogeneous.</p>

      <h2>Safety Profile</h2>
      <p>Across decades of clinical use in approved indications, Tα1 has demonstrated a remarkably <strong>favorable safety profile</strong>. The most commonly reported adverse events are mild injection-site reactions; serious adverse events directly attributable to Tα1 are rare. No major drug-drug interactions have been documented, and the peptide does not appear to suppress endogenous thymic function.</p>

      <h2>Conclusion</h2>
      <p>Thymosin Alpha-1 represents one of the most clinically validated peptide immunomodulators available, with over four decades of research and regulatory approval in multiple jurisdictions. Its TLR-based mechanism positions it as both an immune activator and an immune balancer, making it broadly applicable to research scenarios involving immune dysfunction. For researchers in immunology, oncology, or infectious disease, Tα1 offers an unusually well-characterized tool compound.</p>
    </>),
    references: [
      { journal: "EXPERT OPIN BIOL THER", title: "Thymosin α1: from bench to bedside", year: 2018, identifier: "PMID: 29469595", authors: "Romani L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/29469595/" },
      { journal: "ANN N Y ACAD SCI", title: "Thymosin α1 as a chemotherapy adjuvant: meta-analyses and reviews", year: 2010, identifier: "PMID: 20536572", url: "https://pubmed.ncbi.nlm.nih.gov/20536572/" },
      { journal: "CLIN EXP RHEUMATOL", title: "Thymosin alpha 1 mechanism of action and clinical applications", year: 2015, identifier: "PMID: 26458172", url: "https://pubmed.ncbi.nlm.nih.gov/26458172/" },
      { journal: "WIKIPEDIA", title: "Thymalfasin", url: "https://en.wikipedia.org/wiki/Thymalfasin" },
      { journal: "PUBCHEM", title: "Thymosin α1 — CID 16130571", identifier: "CID 16130571", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16130571" },
    ],
    relatedProductIds: ["ta1"],
  },
  {
    slug: "nad-plus-supplementation-research",
    title: "NAD+ Supplementation: Mechanisms and Current Research",
    excerpt: "A research review of nicotinamide adenine dinucleotide (NAD+) — the essential coenzyme that declines with age. Covers its role in cellular metabolism, sirtuin and PARP enzyme activation, age-related decline, and current supplementation research.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["NAD+", "Longevity", "Metabolism"],
    readingTimeMinutes: 9,
    heroImage: "/nad.jpg",
    metaTitle: "NAD+ Supplementation: Mechanisms, Aging & Current Research (2026)",
    metaDescription: "Research review of NAD+ (nicotinamide adenine dinucleotide) — the essential cellular coenzyme. Covers age-related decline, sirtuin activation, PARP-mediated DNA repair, mitochondrial function, and the latest supplementation research findings.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>NAD+ is a small-molecule coenzyme essential for energy production, DNA repair, and circadian regulation in every living cell.</li>
        <li>NAD+ levels decline significantly with age — by some estimates 50% or more between young adulthood and old age.</li>
        <li>The decline has been linked to age-related metabolic dysfunction, reduced DNA repair capacity, and mitochondrial impairment.</li>
        <li>Supplementation research uses direct NAD+ as well as precursors (NMN, NR) — direct NAD+ is most commonly delivered by injection or IV in research and clinical settings.</li>
      </ul>

      <h2>What Is NAD+?</h2>
      <p><strong>Nicotinamide adenine dinucleotide (NAD+)</strong> is a small molecule found in every living cell. Despite being just a single coenzyme (not a peptide or hormone), NAD+ participates in an extraordinarily wide range of biological processes — making it one of the most-studied molecules in aging biology.</p>
      <p>Its molecular formula is C₂₁H₂₇N₇O₁₄P₂ with a molecular weight of approximately 663 g/mol. Structurally, NAD+ consists of two nucleotides — adenine and nicotinamide — joined by a pair of phosphate groups. The "+" in NAD+ refers to its oxidized state; the reduced form is NADH, and the pair cycles between states as electrons are passed during cellular metabolism.</p>
      <p><em>In plain terms:</em> NAD+ is a tiny molecule your cells use to make energy and repair their DNA. Your levels of it drop a lot as you age, and researchers are studying whether restoring those levels can slow some aspects of aging.</p>

      <h2>Biological Roles</h2>

      <h3>Energy Metabolism</h3>
      <p>The most fundamental role of NAD+ is in <strong>cellular energy production</strong>. In glycolysis, the citric acid cycle, and oxidative phosphorylation, NAD+ accepts electrons from metabolic substrates (becoming NADH), then delivers them to the electron transport chain in the mitochondria to drive ATP synthesis. Without adequate NAD+, energy production stalls.</p>

      <h3>Sirtuin Activation</h3>
      <p><strong>Sirtuins</strong> are a family of NAD+-dependent enzymes (SIRT1 through SIRT7) involved in regulating gene expression, DNA repair, metabolism, and stress responses. Because they consume NAD+ as a cofactor, sirtuin activity is directly limited by NAD+ availability. The decline in NAD+ with age is one proposed mechanism by which sirtuin-mediated longevity pathways become less effective.</p>

      <h3>DNA Repair via PARP Enzymes</h3>
      <p><strong>Poly(ADP-ribose) polymerases (PARPs)</strong> are NAD+-dependent enzymes that detect DNA damage and recruit repair machinery to fix it. PARPs are heavily activated under conditions of genotoxic stress and can consume large amounts of NAD+ — sometimes to the point of depleting cellular pools and triggering metabolic distress.</p>

      <h3>Circadian Rhythm Regulation</h3>
      <p>NAD+ levels themselves oscillate over the course of the day, and this oscillation interacts with the molecular circadian clock through sirtuin-mediated deacetylation of clock proteins. Disruption of NAD+ rhythms has been implicated in shift-work-related metabolic dysfunction.</p>

      <h2>Age-Related Decline</h2>
      <p>One of the most consistent findings across NAD+ research is a substantial <strong>age-related decline</strong> in tissue NAD+ levels. The magnitude varies by tissue and measurement method, but reductions of 40–60% between young adulthood and old age have been documented in multiple tissues including skin, muscle, brain, and liver.</p>
      <p>The decline appears to be driven by both reduced biosynthesis and increased consumption — particularly by chronic activation of PARPs and CD38 (a cell-surface enzyme that consumes NAD+ and whose expression increases with age and inflammation).</p>

      <h2>Supplementation Research</h2>

      <h3>Direct NAD+</h3>
      <p>Direct NAD+ delivery (typically intravenous or intramuscular) has been studied for fatigue, addiction recovery, neurodegenerative conditions, and post-exercise recovery. Most published research is preliminary, with mixed methodologies and small sample sizes — but interest is sustained given the clear biological rationale.</p>

      <h3>NAD+ Precursors</h3>
      <p>Research has also examined NAD+ precursors — most commonly <strong>nicotinamide mononucleotide (NMN)</strong> and <strong>nicotinamide riboside (NR)</strong> — which are taken orally and converted to NAD+ inside cells. Multiple human studies have demonstrated that these precursors meaningfully elevate blood and tissue NAD+ levels, though clinical outcomes data remain mixed.</p>

      <h3>Sirtuin-Mediated Outcomes</h3>
      <p>A parallel research stream examines whether restoring NAD+ levels meaningfully recovers sirtuin function — and whether sirtuin recovery in turn reverses age-related dysfunction. Animal models have produced positive results in metabolic, neurological, and cardiovascular domains; human translation remains an active research area.</p>

      <h2>Safety</h2>
      <p>NAD+ has a generally favorable safety profile in human research, with mild flushing, transient nausea, and injection-site discomfort being the most common reported effects. Because NAD+ is endogenous and rapidly metabolized, accumulation toxicity is not a typical concern. As with any small molecule, hypersensitivity reactions are possible but rare.</p>

      <h2>Conclusion</h2>
      <p>NAD+ sits at the intersection of metabolism, DNA repair, gene regulation, and circadian biology. Its well-documented age-related decline and its essential role in pathways central to cellular health have made it one of the most active areas of aging research. For researchers working on mitochondrial function, sirtuin biology, DNA damage response, or metabolic regulation, NAD+ provides a foundational research tool with broad applicability.</p>
    </>),
    references: [
      { journal: "CELL METAB", title: "NAD+ Metabolism and Its Roles in Cellular Processes during Ageing", year: 2020, identifier: "PMID: 32130985", authors: "Covarrubias AJ, Perrone R, Grozio A, Verdin E", url: "https://pubmed.ncbi.nlm.nih.gov/32130985/" },
      { journal: "SCIENCE", title: "Declining NAD+ Induces a Pseudohypoxic State Disrupting Nuclear-Mitochondrial Communication during Aging", year: 2013, identifier: "PMID: 24360282", authors: "Gomes AP et al.", url: "https://pubmed.ncbi.nlm.nih.gov/24360282/" },
      { journal: "CELL METAB", title: "Therapeutic Potential of NAD-Boosting Molecules: The In Vivo Evidence", year: 2018, identifier: "PMID: 29874566", authors: "Rajman L, Chwalek K, Sinclair DA", url: "https://pubmed.ncbi.nlm.nih.gov/29874566/" },
      { journal: "WIKIPEDIA", title: "Nicotinamide adenine dinucleotide", url: "https://en.wikipedia.org/wiki/Nicotinamide_adenine_dinucleotide" },
      { journal: "PUBCHEM", title: "NAD+ — CID 5893", identifier: "CID 5893", url: "https://pubchem.ncbi.nlm.nih.gov/compound/5893" },
    ],
    relatedProductIds: ["nad"],
  },
  {
    slug: "selank-semax-russian-nootropic-peptides",
    title: "Selank and Semax: Russian Nootropic Peptides Research Summary",
    excerpt: "A research review of Selank and Semax — two synthetic peptides developed at the Russian Academy of Sciences. Covers their mechanisms via BDNF and cytokine modulation, anxiolytic vs nootropic profiles, and the clinical research behind both compounds.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["Selank", "Semax", "Cognitive", "Mechanism"],
    readingTimeMinutes: 9,
    heroImage: "/semax.jpg",
    metaTitle: "Selank vs Semax: Russian Nootropic Peptide Research (2026)",
    metaDescription: "Research review of Selank (anxiolytic) and Semax (nootropic) — synthetic peptides developed at the Russian Academy of Sciences. Covers BDNF upregulation, tuftsin and ACTH analog mechanisms, clinical research findings, and comparative use.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li><strong>Selank</strong> is a synthetic 7-amino-acid analog of the immunomodulatory peptide <em>tuftsin</em>, with anxiolytic and mild nootropic effects.</li>
        <li><strong>Semax</strong> is a synthetic 7-amino-acid analog of adrenocorticotropic hormone (ACTH 4-10) fragment, with primarily nootropic and neuroprotective effects.</li>
        <li>Both were developed at the Russian Academy of Sciences and are approved as medications in Russia.</li>
        <li>Mechanism: both upregulate BDNF (brain-derived neurotrophic factor) and modulate monoamine neurotransmitter systems.</li>
      </ul>

      <h2>Background: Russian Peptide Development</h2>
      <p>Russia has a distinctive pharmaceutical tradition of developing small synthetic peptides for neurological and psychiatric indications — many emerging from the <strong>Institute of Molecular Genetics, Russian Academy of Sciences</strong>. Both Selank and Semax originate from this program, which has prioritized peptides modeled on natural regulatory molecules with structural modifications that improve in vivo stability.</p>
      <p>While these compounds have decades of Russian clinical experience behind them, neither has FDA approval in the United States, and the published Western-journal literature is more limited than for compounds with broader regulatory adoption.</p>

      <h2>Selank: The Anxiolytic Tuftsin Analog</h2>

      <h3>Structure and Origin</h3>
      <p>Selank is a synthetic heptapeptide with the sequence <strong>Thr-Lys-Pro-Arg-Pro-Gly-Pro</strong> (TKPRPGP). The first four amino acids (TKPR) correspond to the natural immunomodulatory peptide <strong>tuftsin</strong>, with a C-terminal Pro-Gly-Pro extension added to substantially improve proteolytic stability. Molecular weight is approximately 751.87 g/mol.</p>

      <h3>Mechanism of Action</h3>
      <p>Selank's mechanism involves several parallel pathways:</p>
      <ul>
        <li><strong>BDNF upregulation</strong> — particularly in the hippocampus, which appears to mediate cognitive and mood effects.</li>
        <li><strong>Modulation of enkephalin degradation</strong> — Selank inhibits enzymes that break down endogenous opioid peptides, indirectly enhancing endogenous opioid signaling.</li>
        <li><strong>Th1/Th2 cytokine balance</strong> — a direct immunomodulatory effect inherited from its tuftsin origin.</li>
        <li><strong>Serotonergic and dopaminergic modulation</strong> — observed in animal models, contributing to its anxiolytic profile.</li>
      </ul>

      <h3>Clinical Research</h3>
      <p>Russian clinical research has examined Selank in <strong>generalized anxiety disorder</strong>, with reported efficacy comparable to traditional benzodiazepines but without sedation, cognitive impairment, or dependence. Smaller studies have examined cognitive performance, immune modulation, and adjunctive use in mood disorders.</p>

      <h2>Semax: The Nootropic ACTH Analog</h2>

      <h3>Structure and Origin</h3>
      <p>Semax is a synthetic heptapeptide with the sequence <strong>Met-Glu-His-Phe-Pro-Gly-Pro</strong> (MEHFPGP). The first four amino acids correspond to ACTH residues 4–7, with the same Pro-Gly-Pro stability extension as Selank. Molecular weight is approximately 813.92 g/mol.</p>
      <p>Critically, Semax retains the cognitive and neurotrophic effects of ACTH(4-10) without the endocrine effects of the full ACTH hormone — making it neuropharmacologically useful without affecting cortisol regulation.</p>

      <h3>Mechanism of Action</h3>
      <p>Semax's most-cited mechanism is potent <strong>upregulation of BDNF and its receptor TrkB</strong> in the hippocampus. The peptide rapidly (within hours) elevates BDNF protein levels, which in turn supports neurogenesis, synaptic plasticity, and neuronal survival under stress. Additional documented effects include modulation of dopaminergic and serotonergic systems and direct neuroprotective effects against ischemic damage.</p>

      <h3>Clinical Research</h3>
      <p>Russian clinical research has focused on:</p>
      <ul>
        <li><strong>Ischemic stroke</strong> — adjunctive use during the acute and recovery phases, with reported improvements in neurological deficit scores.</li>
        <li><strong>Cognitive impairment</strong> — both age-related and following brain injury.</li>
        <li><strong>Optic nerve disorders</strong> — leveraging Semax's neuroprotective profile.</li>
        <li><strong>ADHD and learning disabilities</strong> in pediatric populations.</li>
      </ul>

      <h2>Selank vs Semax: When Each Is Used</h2>
      <p>Although structurally similar (both heptapeptides with Pro-Gly-Pro stability extensions) and sharing some mechanistic overlap (both upregulate BDNF), the two compounds have distinct therapeutic profiles:</p>
      <ul>
        <li><strong>Selank</strong> — primarily anxiolytic with mild cognitive support. Closer comparator: benzodiazepines (without sedation).</li>
        <li><strong>Semax</strong> — primarily nootropic and neuroprotective. Closer comparator: cognitive enhancers like piracetam, with stronger neurotrophic effects.</li>
      </ul>

      <h2>Safety</h2>
      <p>Both peptides have demonstrated favorable safety profiles in Russian clinical research, with minimal adverse events reported across decades of medical use. The most commonly reported effects are mild and transient — typically related to the intranasal administration route (the most common delivery method in Russian practice). Neither peptide is known to produce dependence or withdrawal.</p>

      <h2>Conclusion</h2>
      <p>Selank and Semax represent a unique slice of peptide neuropharmacology — well-characterized in Russian research, less so in Western literature, but with distinctive mechanistic profiles based on BDNF upregulation and monoamine modulation. For researchers investigating peptide-based approaches to anxiety, cognitive enhancement, or neuroprotection, both compounds offer well-defined starting points with substantial existing literature in their respective domains.</p>
    </>),
    references: [
      { journal: "EXPERT OPIN INVESTIG DRUGS", title: "Semax, an analog of ACTH(4-10) with cognitive effects: from molecular mechanisms to clinical applications", year: 2018, identifier: "PMID: 30067100", url: "https://pubmed.ncbi.nlm.nih.gov/30067100/" },
      { journal: "BULL EXP BIOL MED", title: "Selank, a peptide analog of tuftsin, influences gene expression in serotonergic and dopaminergic neurons", year: 2009, identifier: "PMID: 19798403", url: "https://pubmed.ncbi.nlm.nih.gov/19798403/" },
      { journal: "INT J MOL SCI", title: "The Neuroprotective Effect of Semax in Models of Cerebral Ischemia: Role of BDNF and Trk-Receptor Signaling", year: 2019, identifier: "PMID: 31416202", url: "https://pubmed.ncbi.nlm.nih.gov/31416202/" },
      { journal: "ZH NEVROL PSIKHIATR IM S S KORSAKOVA", title: "Clinical and experimental evaluation of the anxiolytic action of Selank", year: 2005, identifier: "PMID: 16447562", authors: "Medvedev VE et al.", url: "https://pubmed.ncbi.nlm.nih.gov/16447562/" },
      { journal: "WIKIPEDIA", title: "Selank", url: "https://en.wikipedia.org/wiki/Selank" },
      { journal: "WIKIPEDIA", title: "Semax", url: "https://en.wikipedia.org/wiki/Semax" },
    ],
    relatedProductIds: ["selank", "semax"],
  },
  {
    slug: "mots-c-mitochondrial-peptide-research",
    title: "MOTS-c: The Mitochondrial Peptide and Metabolic Health Research",
    excerpt: "A research review of MOTS-c — the mitochondrially-encoded peptide. Covers its discovery, AMPK pathway activation, role as an exercise mimetic, and implications for insulin sensitivity and metabolic health research.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["MOTS-c", "Longevity", "Metabolism", "Exercise Mimetic"],
    readingTimeMinutes: 8,
    heroImage: "/motsc.jpg",
    metaTitle: "MOTS-c Research: Mitochondrial Peptide & Metabolic Health (2026)",
    metaDescription: "Research review of MOTS-c — the 16-amino-acid mitochondrial-derived peptide. Covers AMPK pathway activation, exercise mimetic effects, insulin sensitivity, glucose metabolism, and the foundational research from the Pinchas Cohen laboratory.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>MOTS-c is a 16-amino-acid peptide encoded by the mitochondrial DNA — one of a small class of "mitochondrial-derived peptides."</li>
        <li>Activates the AMPK pathway, enhancing glucose uptake, fatty acid oxidation, and insulin sensitivity.</li>
        <li>Has been described as an "exercise mimetic" because many of its metabolic effects parallel those of physical exercise.</li>
        <li>Discovered in 2015 by Dr. Pinchas Cohen's laboratory at USC; research applications are expanding rapidly.</li>
      </ul>

      <h2>What Is MOTS-c?</h2>
      <p><strong>MOTS-c</strong> — short for <em>Mitochondrial Open Reading Frame of the Twelve S rRNA type-c</em> — is a 16-amino-acid peptide with the sequence <strong>Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg</strong>. The peptide was first characterized in 2015 by the research group of Dr. Pinchas Cohen at the University of Southern California.</p>
      <p>What makes MOTS-c remarkable is its origin: it is encoded within the <strong>mitochondrial DNA</strong> (specifically in the 12S rRNA region), not the nuclear genome. This places MOTS-c in a small but growing class of <strong>mitochondrial-derived peptides (MDPs)</strong>, which appear to act as signaling molecules between mitochondria and the rest of the cell.</p>
      <p><em>In plain terms:</em> Most of your body's proteins are made from instructions stored in your cell nucleus. MOTS-c is unusual because it's made from instructions stored inside the mitochondria themselves. It seems to act as a signal that tells the rest of your body how the mitochondria are doing.</p>

      <h2>Mechanism of Action</h2>

      <h3>AMPK Pathway Activation</h3>
      <p>The primary downstream target of MOTS-c is <strong>AMP-activated protein kinase (AMPK)</strong> — a master regulator of cellular energy balance. AMPK activation triggers a coordinated set of effects: increased glucose uptake into cells, enhanced fatty acid oxidation, suppression of energy-consuming biosynthetic pathways, and activation of mitochondrial biogenesis.</p>
      <p>Notably, AMPK is the same pathway activated by physical exercise and by metformin (the most prescribed antidiabetic drug) — explaining MOTS-c's classification as an "exercise mimetic."</p>

      <h3>Nuclear Translocation</h3>
      <p>One particularly striking finding is that MOTS-c <strong>translocates from the mitochondria to the cell nucleus</strong> under metabolic stress, where it appears to regulate the expression of nuclear genes involved in metabolic adaptation. This bidirectional communication — mitochondria sending peptide signals to the nucleus — represents a novel layer of cellular metabolic regulation.</p>

      <h3>Insulin Sensitivity</h3>
      <p>Animal studies have demonstrated that MOTS-c improves <strong>insulin sensitivity</strong> in both skeletal muscle and adipose tissue, partially reversing high-fat-diet-induced insulin resistance. This effect appears to be mediated by AMPK activation and enhanced glucose disposal capacity.</p>

      <h2>Research Applications</h2>

      <h3>Metabolic Health</h3>
      <p>The largest body of MOTS-c research focuses on <strong>metabolic disease models</strong> — type 2 diabetes, obesity, and metabolic syndrome. Across multiple animal models, MOTS-c administration improves fasting glucose, insulin sensitivity, body composition, and lipid profile. Human research is still preliminary but expanding.</p>

      <h3>Exercise and Performance Research</h3>
      <p>MOTS-c levels naturally rise in response to <strong>physical exercise</strong>, and supplementation studies have examined whether exogenous MOTS-c can recapitulate or amplify exercise's metabolic benefits. Animal research has demonstrated improvements in running endurance and skeletal muscle metabolic capacity.</p>

      <h3>Aging Research</h3>
      <p>MOTS-c levels decline with age, paralleling the broader pattern of declining mitochondrial function. Restoration research in aged animal models has shown improvements in metabolic flexibility, exercise capacity, and several markers of metabolic age — making MOTS-c a research focus in <strong>longevity science</strong>.</p>

      <h3>Cardiovascular Research</h3>
      <p>Smaller studies have examined MOTS-c in cardiovascular contexts, including endothelial function, vascular calcification, and ischemia-reperfusion injury. Findings have been broadly consistent with the AMPK-mediated protective profile observed in metabolic studies.</p>

      <h2>Safety</h2>
      <p>MOTS-c has demonstrated a favorable safety profile in animal studies, with no significant toxicity at the doses tested. Human safety data remain limited but no major adverse signal has emerged. As with all peptides, individual variation in response is expected, and the long-term effects of sustained MOTS-c supplementation in humans have not been fully characterized.</p>

      <h2>Conclusion</h2>
      <p>MOTS-c represents one of the most exciting recent additions to peptide research — both because of its novel mitochondrial origin and because of its potent effects on the AMPK pathway. As the field of mitochondrial-derived peptides matures, MOTS-c is positioned as the most thoroughly characterized member of this emerging class. For researchers in metabolism, aging biology, or exercise physiology, MOTS-c offers a uniquely targeted tool for studying mitochondrial-to-nuclear signaling.</p>
    </>),
    references: [
      { journal: "CELL METAB", title: "The mitochondrial-derived peptide MOTS-c promotes metabolic homeostasis and reduces obesity and insulin resistance", year: 2015, identifier: "PMID: 25738459", authors: "Lee C et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25738459/" },
      { journal: "CELL METAB", title: "Mitochondrial-encoded MOTS-c translocates to the nucleus to regulate nuclear gene expression in response to metabolic stress", year: 2018, identifier: "PMID: 29551415", authors: "Kim KH et al.", url: "https://pubmed.ncbi.nlm.nih.gov/29551415/" },
      { journal: "FRONT ENDOCRINOL", title: "MOTS-c: A promising mitochondrial-derived peptide for therapeutic exploitation", year: 2023, identifier: "PMC9905433", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9905433/" },
      { journal: "WIKIPEDIA", title: "MOTS-c", url: "https://en.wikipedia.org/wiki/MOTS-c" },
      { journal: "PUBCHEM", title: "MOTS-c — CID 118767809", identifier: "CID 118767809", url: "https://pubchem.ncbi.nlm.nih.gov/compound/118767809" },
    ],
    relatedProductIds: ["motsc"],
  },
  {
    slug: "tissue-repair-peptide-blends-research",
    title: "Peptide Blends for Tissue Repair: BPC-157 + GHK-Cu + TB-500 Research Rationale",
    excerpt: "An evidence-based review of multi-peptide tissue repair blends. Covers the complementary mechanisms of BPC-157, GHK-Cu, TB-500 (and KPV), the research rationale for combining them, and the current state of single-compound versus combination evidence.",
    date: "2026-06-28",
    author: "Tier One Research Team",
    tags: ["Blends", "Recovery", "GLOW", "KLOW", "Tissue Repair"],
    readingTimeMinutes: 9,
    heroImage: "/glow.jpg",
    metaTitle: "Peptide Blends for Tissue Repair: BPC-157 + GHK-Cu + TB-500 (2026)",
    metaDescription: "Research rationale for combining BPC-157, GHK-Cu, TB-500, and KPV in tissue repair blends. Covers complementary mechanisms (angiogenesis, gene expression, actin binding, anti-inflammation), single-compound research, and current combination evidence.",
    content: () => (<>
      <h2>Quick Summary</h2>
      <ul>
        <li>Multi-peptide tissue repair blends combine compounds with <strong>complementary mechanisms</strong> rather than redundant ones.</li>
        <li><strong>BPC-157</strong> promotes angiogenesis and modulates the nitric oxide system; <strong>GHK-Cu</strong> regulates over 4,000 genes involved in tissue regeneration; <strong>TB-500</strong> (Thymosin β4 fragment) drives cell migration via actin binding; <strong>KPV</strong> provides α-MSH-derived anti-inflammatory action.</li>
        <li>The research rationale for combining them is mechanistic complementarity — different points in the repair cascade are addressed simultaneously.</li>
        <li>Published controlled trials specifically on the blend formulations themselves do not exist; the evidence base is from the individual component compounds.</li>
      </ul>

      <h2>Why Combine Peptides for Tissue Repair?</h2>
      <p>Tissue repair is a multi-stage biological process, not a single event. Following injury, the body sequentially activates hemostasis, inflammation, proliferation, and remodeling — each phase governed by different cellular populations and signaling pathways. The premise behind multi-peptide tissue repair blends is that compounds targeting <strong>distinct phases or pathways</strong> can address the repair cascade more comprehensively than any single compound alone.</p>
      <p>This approach has analogs in conventional pharmacology — combination therapies in oncology, HIV, and chronic disease management all rely on attacking a process through multiple parallel mechanisms.</p>
      <p><em>In plain terms:</em> Tissue healing isn't one event — it's a chain of overlapping processes (inflammation, building new tissue, remodeling). Blends combine peptides that each handle different parts of that chain.</p>

      <h2>The Component Compounds</h2>

      <h3>BPC-157: Angiogenesis and Tissue Protection</h3>
      <p><strong>BPC-157</strong> (Body Protection Compound) is a synthetic pentadecapeptide whose primary documented effects include upregulation of VEGFR2 (driving angiogenesis), modulation of the nitric oxide system, and sensitization of tissues to growth hormone. In musculoskeletal repair models, BPC-157 accelerates healing of tendon, ligament, and muscle injuries — with measurably improved collagen organization and tensile strength.</p>
      <p>Its contribution to a tissue repair blend: <strong>vascular and matrix-level support for the regenerating tissue</strong>, enabling oxygen and nutrient delivery to the injury site.</p>

      <h3>GHK-Cu: Gene Expression and Regenerative Programming</h3>
      <p><strong>GHK-Cu</strong> is a naturally occurring copper-binding tripeptide that modulates the expression of over 4,000 human genes — broadly favoring regenerative, anti-inflammatory, and "youthful" expression patterns. In wound healing models, GHK-Cu accelerates closure, improves collagen deposition, and recruits repair-active cells to injury sites.</p>
      <p>Its contribution to a tissue repair blend: <strong>broad gene-expression reprogramming toward the regenerative phenotype</strong> across multiple cell types involved in repair.</p>

      <h3>TB-500: Cell Migration and Actin Dynamics</h3>
      <p><strong>TB-500</strong> is a synthetic N-acetylated active fragment of Thymosin β4 (residues 17–23). Its primary documented effect is <strong>actin binding</strong> — the cytoskeletal protein that regulates cell migration. By modulating actin dynamics, TB-500 accelerates the movement of repair-active cells (fibroblasts, endothelial cells, keratinocytes) into injury sites.</p>
      <p>Its contribution to a tissue repair blend: <strong>improved cellular mobility</strong>, allowing repair cells to reach the injury location faster.</p>

      <h3>KPV: Targeted Anti-Inflammatory Action</h3>
      <p><strong>KPV</strong> (Lys-Pro-Val) is the C-terminal tripeptide of α-melanocyte-stimulating hormone (α-MSH). It retains the anti-inflammatory properties of full α-MSH — including suppression of NF-κB signaling and pro-inflammatory cytokine production — but lacks the pigmenting effects associated with melanocortin receptor activation.</p>
      <p>Its contribution to a tissue repair blend (included in KLOW formulations): <strong>focused anti-inflammatory action</strong> without off-target endocrine effects, dampening the inflammatory phase to allow proliferation and remodeling to proceed.</p>

      <h2>Research Rationale for the Combinations</h2>

      <h3>GLOW: BPC-157 + GHK-Cu + TB-500</h3>
      <p>The three-component GLOW blend combines compounds covering <strong>angiogenesis + gene expression + cell migration</strong>. Mechanistically, these address vascular support, regenerative programming, and cellular mobility — three foundational requirements for tissue repair that operate in parallel rather than in series.</p>

      <h3>KLOW: BPC-157 + GHK-Cu + TB-500 + KPV</h3>
      <p>The four-component KLOW blend adds <strong>anti-inflammatory action</strong> via KPV. The rationale: in scenarios where excessive or prolonged inflammation impedes repair (chronic injuries, autoimmune-associated tissue damage, post-surgical recovery), dampening the inflammatory phase while supporting the regenerative phase may produce better outcomes than the regenerative components alone.</p>

      <h2>The State of Combination Research</h2>
      <p>An important honest note: <strong>peer-reviewed clinical trials specifically on the BPC-157 + GHK-Cu + TB-500 (± KPV) combination formulations themselves have not been published.</strong> The research basis for combining these compounds is mechanistic — derived from the established (but predominantly preclinical) research on each individual component.</p>
      <p>This is not unique to peptide blends; many combination therapies in mainstream pharmacology emerged from individual-component research before formal combination trials were conducted. But it is a meaningful limitation that researchers using these blends should be aware of when interpreting outcomes.</p>

      <h2>Safety Considerations</h2>
      <p>Each component peptide individually has a favorable safety profile in animal research and (where available) human use. Combination safety is generally inferred from component profiles, with no documented adverse pharmacokinetic or pharmacodynamic interactions between the four. As with all research peptides, individual variability is expected and the long-term safety of sustained combination administration in humans has not been formally characterized.</p>

      <h2>Conclusion</h2>
      <p>Multi-peptide tissue repair blends represent a mechanistically rational extension of single-compound peptide research — combining compounds whose effects are complementary rather than redundant. The strongest argument for the combination approach lies in the multi-phase nature of tissue repair and the documented distinct mechanisms of each component. The strongest caveat is that the combination itself has not yet been studied in controlled trials. For researchers studying tissue regeneration with peptide tools, the blend approach offers a practical way to address multiple repair pathways simultaneously — with the understanding that the combination's specific synergies remain to be formally characterized.</p>
    </>),
    references: [
      { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", authors: "BPC-157 component", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
      { journal: "BIOMED RES INT", title: "GHK-Cu may prevent oxidative stress in skin by regulating copper and modifying expression of numerous antioxidant genes", year: 2014, identifier: "PMID: 25196481", authors: "GHK-Cu component · Pickart L et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25196481/" },
      { journal: "ANN N Y ACAD SCI", title: "Thymosin β4 and tissue repair: the actin-sequestering peptide that regulates cell migration and wound healing", year: 2010, identifier: "PMID: 20536557", authors: "TB-500 component · Goldstein AL et al.", url: "https://pubmed.ncbi.nlm.nih.gov/20536557/" },
      { journal: "PEPTIDES", title: "α-MSH-derived tripeptide KPV exerts anti-inflammatory effects via the melanocortin pathway", year: 2003, identifier: "PMID: 12676251", authors: "KPV component", url: "https://pubmed.ncbi.nlm.nih.gov/12676251/" },
      { journal: "FASEB J", title: "The tripeptide KPV (Lys-Pro-Val) reduces inflammation in models of colitis", year: 2010, identifier: "PMID: 20736340", authors: "KPV component", url: "https://pubmed.ncbi.nlm.nih.gov/20736340/" },
    ],
    relatedProductIds: ["glow", "klow", "bpc157-10", "ghkcu-100", "tb500"],
  },
];

function getArticleBySlug(slug) {
  return ARTICLES.find(a => a.slug === slug) || null;
}

// ─── Scroll Reveal Hook ──────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    document.querySelectorAll(".scroll-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Animated Count-Up Component ─────────────────────────────────────────────
function CountUp({ end, duration = 1500, suffix = "", prefix = "" }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();
          const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(end * eased));
            if (progress < 1) requestAnimationFrame(animate);
            else setCount(end);
          };
          requestAnimationFrame(animate);
        }
      });
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

// ─── Page Title & Meta Helper ─────────────────────────────────────────────────
function usePageMeta(title, description) {
  useEffect(() => {
    const suffix = " | Tier One BioSystems";
    const fullTitle = title ? title + suffix : "Tier One BioSystems — Research Grade Peptides";
    document.title = fullTitle;
    const setMeta = (selector, value) => {
      if (!value) return;
      const el = document.querySelector(selector);
      if (el) el.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', window.location.href);
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', description);
    return () => {
      document.title = "Tier One BioSystems — Research Grade Peptides";
    };
  }, [title, description]);
}

// ─── Fonts via CDN ───────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ─── Styles ──────────────────────────────────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  :root {
    --bg-primary: #0a0a0a;
    --bg-card: #111111;
    --bg-card-hover: #1a1a1a;
    --bg-modal: #0d0d0d;
    --red-primary: #c41e2a;
    --red-glow: #ff2d3b;
    --red-dark: #8b1520;
    --text-primary: #f0f0f0;
    --text-secondary: #888888;
    --text-dim: #555555;
    --border: #222222;
    --border-hover: #333333;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Rajdhani', sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  #root { min-height: 100vh; }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-primary); }
  ::-webkit-scrollbar-thumb { background: var(--red-dark); border-radius: 3px; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(60px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(196, 30, 42, 0.15); }
    50% { box-shadow: 0 0 40px rgba(196, 30, 42, 0.3); }
  }

  @keyframes scanLine {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }

  @keyframes borderGlow {
    0%, 100% { border-color: rgba(196, 30, 42, 0.2); }
    50% { border-color: rgba(196, 30, 42, 0.5); }
  }

  @keyframes heroZoom {
    0% { transform: scale(1.0); }
    100% { transform: scale(1.05); }
  }

  @keyframes redGlowBreathe {
    0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  }

  @keyframes pulseReturn {
    0%, 100% { background: rgba(34,197,94,0.08); }
    50% { background: rgba(34,197,94,0.18); }
  }

  @keyframes pulseConfirm {
    0% { box-shadow: 0 0 0 0 rgba(196,30,42,0.6); }
    70% { box-shadow: 0 0 0 14px rgba(196,30,42,0); }
    100% { box-shadow: 0 0 0 0 rgba(196,30,42,0); }
  }

  .article-body h2 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 800;
    font-size: 24px;
    letter-spacing: 0.02em;
    color: var(--text-primary);
    margin-top: 38px;
    margin-bottom: 14px;
    line-height: 1.25;
  }
  .article-body h2:first-child { margin-top: 0; }
  .article-body h3 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--red-primary);
    margin-top: 28px;
    margin-bottom: 10px;
  }
  .article-body p {
    margin: 0 0 18px;
  }
  .article-body ul {
    margin: 0 0 22px;
    padding-left: 22px;
  }
  .article-body li {
    margin-bottom: 8px;
  }
  .article-body strong {
    color: var(--text-primary);
    font-weight: 700;
  }
  .article-body a {
    color: var(--red-primary);
    text-decoration: none;
    border-bottom: 1px solid rgba(196,30,42,0.4);
  }
  .article-body a:hover {
    border-bottom-color: var(--red-primary);
  }

  /* Scroll reveal — hidden initially, revealed when .revealed is added */
  .scroll-reveal {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  .scroll-reveal.revealed {
    opacity: 1;
    transform: translateY(0);
  }

  /* Enhanced product card hover */
  .product-card-inner {
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .product-card:hover .product-card-inner {
    transform: scale(1.06);
  }
  .product-card {
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease, border-color 0.4s ease;
  }
  .product-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 16px 40px rgba(196, 30, 42, 0.15);
  }

  .hero-grid-line {
    position: absolute;
    background: linear-gradient(to bottom, transparent, rgba(196,30,42,0.06), transparent);
    width: 1px;
    height: 100%;
    top: 0;
  }
`;
document.head.appendChild(style);

// ─── Components ──────────────────────────────────────────────────────────────

function CartPopup({ cart, visible, onClose }) {
  const navigate = useNavigate();
  if (!visible || cart.length === 0) return null;

  const tieredPrice = (item) => {
    if (item.qty >= 25) return Math.round(item.bulk * 0.90 * 100) / 100;
    if (item.qty >= 10) return Math.round(item.bulk * 0.95 * 100) / 100;
    if (item.qty >= 5) return item.bulk;
    return item.price;
  };
  const subtotal = cart.reduce((sum, item) => sum + tieredPrice(item) * item.qty, 0);
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div style={{
      position: "fixed",
      top: 70,
      right: 20,
      width: 320,
      maxHeight: 420,
      background: "var(--bg-secondary, #141414)",
      border: "1px solid rgba(196,30,42,0.4)",
      borderRadius: 4,
      zIndex: 10000,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      animation: "fadeUp 0.3s ease-out",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid rgba(196,30,42,0.2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
        }}>Item Added to Cart</span>
        <span onClick={onClose} style={{
          cursor: "pointer",
          color: "var(--text-dim)",
          fontSize: 18,
          lineHeight: 1,
        }}>&times;</span>
      </div>

      {/* Items */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px 16px",
      }}>
        {cart.map(item => (
          <div key={item.id} style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 4,
              overflow: "hidden",
              flexShrink: 0,
              border: "1px solid rgba(196,30,42,0.2)",
            }}>
              <img src={item.image} alt={item.name} style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>{item.name} {item.dose}</div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                color: "var(--text-dim)",
              }}>Qty: {item.qty}</div>
            </div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}>${(tieredPrice(item) * item.qty).toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid rgba(196,30,42,0.2)",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            color: "var(--text-dim)",
          }}>{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
          <span style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "0.04em",
          }}>${subtotal.toFixed(2)}</span>
        </div>
        <button onClick={() => { onClose(); navigate("/cart"); }} style={{
          width: "100%",
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          padding: "12px 0",
          background: "var(--red-primary)",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          textTransform: "uppercase",
          transition: "opacity 0.2s",
        }}>View Cart</button>
      </div>
    </div>
  );
}

function Header({ cartCount = 0 }) {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Close menu when navigating
  const handleNav = (dest) => {
    setMenuOpen(false);
    if (dest === "Products") navigate("/products");
    else if (dest === "Lab Results") navigate("/lab-results");
    else if (dest === "Calculator") navigate("/calculator");
    else if (dest === "Research") navigate("/research");
    else if (dest === "Contact") navigate("/contact");
    else if (dest === "Cart") navigate("/cart");
    else navigate("/");
  };

  return (
    <header style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: "linear-gradient(to bottom, rgba(10,10,10,0.98), rgba(10,10,10,0.92))",
      backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(196,30,42,0.15)",
    }}>
      <div style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: isMobile ? "6px 16px" : "6px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div
          onClick={() => { setMenuOpen(false); navigate("/"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <img
            src="/logo_transparent.png"
            alt="Tier One BioSystems"
            style={{
              height: 90,
              width: "auto",
              objectFit: "contain",
            }}
          />
        </div>

        <nav style={{ display: "flex", gap: isMobile ? 16 : 32, alignItems: "center" }}>
          {/* Desktop nav */}
          {!isMobile && ["Products", "Research", "Lab Results", "Calculator", "Contact"].map(item => (
            <span
              key={item}
              onClick={() => handleNav(item)}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                cursor: "pointer",
                transition: "color 0.2s",
                position: "relative",
              }}
              onMouseEnter={e => e.target.style.color = "var(--red-primary)"}
              onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}
            >{item}</span>
          ))}

          {/* Cart icon (always visible) */}
          <div aria-label="Shopping cart" onClick={() => { setMenuOpen(false); navigate("/cart"); }} style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 22,
              color: "var(--text-secondary)",
              userSelect: "none",
            }}>🛒</span>
            {cartCount > 0 && (
              <span style={{
                position: "absolute",
                top: -6,
                right: -8,
                background: "var(--red-primary)",
                color: "#fff",
                fontSize: 11,
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 700,
                borderRadius: "50%",
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>{cartCount}</span>
            )}
          </div>

          {/* Hamburger button (mobile only) */}
          {isMobile && (
            <div
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: 4,
                marginLeft: 4,
              }}
            >
              <span style={{
                display: "block",
                width: 22,
                height: 2,
                background: menuOpen ? "var(--red-primary)" : "var(--text-secondary)",
                transition: "all 0.3s",
                transform: menuOpen ? "rotate(45deg) translate(3.5px, 3.5px)" : "none",
              }} />
              <span style={{
                display: "block",
                width: 22,
                height: 2,
                background: menuOpen ? "transparent" : "var(--text-secondary)",
                transition: "all 0.3s",
              }} />
              <span style={{
                display: "block",
                width: 22,
                height: 2,
                background: menuOpen ? "var(--red-primary)" : "var(--text-secondary)",
                transition: "all 0.3s",
                transform: menuOpen ? "rotate(-45deg) translate(3.5px, -3.5px)" : "none",
              }} />
            </div>
          )}
        </nav>
      </div>

      {/* Mobile dropdown menu */}
      {isMobile && menuOpen && (
        <div style={{
          background: "rgba(10,10,10,0.98)",
          borderTop: "1px solid rgba(196,30,42,0.15)",
          padding: "12px 0",
          animation: "fadeIn 0.2s ease-out",
        }}>
          {["Products", "Research", "Lab Results", "Calculator", "Contact", "Cart"].map(item => (
            <div
              key={item}
              onClick={() => handleNav(item)}
              style={{
                padding: "14px 24px",
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                transition: "all 0.2s",
              }}
            >{item}</div>
          ))}
        </div>
      )}
    </header>
  );
}

function Hero() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 700);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section style={{
      position: "relative",
      paddingTop: 120,
      paddingBottom: 80,
      overflow: "hidden",
      textAlign: "center",
      minHeight: "clamp(380px, 55vh, 620px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {/* Background vial image with zoom + parallax */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url('/herobackground.jpg')`,
        backgroundSize: isMobile ? "150% auto" : "auto 100%",
        backgroundPosition: `center ${(isMobile ? 25 : 45) + scrollY * 0.012}%`,
        backgroundRepeat: "no-repeat",
        opacity: 0.52,
        pointerEvents: "none",
        animation: "heroZoom 24s ease-in-out infinite alternate",
      }} />

      {/* Dark overlay for text readability */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(10,10,10,0.4) 0%, rgba(10,10,10,0.7) 50%, rgba(10,10,10,0.95) 100%)",
        pointerEvents: "none",
      }} />

      {/* Red glow behind text — breathes */}
      <div style={{
        position: "absolute",
        top: "40%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 700,
        height: 500,
        background: "radial-gradient(ellipse, rgba(196,30,42,0.15) 0%, transparent 65%)",
        pointerEvents: "none",
        animation: "redGlowBreathe 6s ease-in-out infinite",
      }} />

      <div style={{
        position: "relative",
        zIndex: 1,
        animation: "fadeUp 1s ease-out",
        padding: "0 24px",
        maxWidth: 1400,
        margin: "0 auto",
        width: "100%",
        textAlign: "left",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 400,
          fontSize: 12,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 20,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          RESEARCH GRADE PEPTIDES
        </div>

        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 900,
          lineHeight: 1.0,
          marginBottom: 16,
          textTransform: "uppercase",
        }}>
          <span style={{
            display: "block",
            fontSize: "clamp(40px, 7vw, 80px)",
            color: "var(--text-primary)",
            letterSpacing: "0.04em",
          }}>TIER ONE</span>
          <span style={{
            display: "block",
            fontSize: "clamp(40px, 7vw, 80px)",
            color: "var(--red-primary)",
            letterSpacing: "0.04em",
          }}>BIOSYSTEMS</span>
        </h1>

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "clamp(20px, 3vw, 30px)",
          fontWeight: 500,
          fontStyle: "italic",
          color: "var(--text-secondary)",
          marginBottom: 24,
          letterSpacing: "0.02em",
        }}>Precision. Purity. Performance.</div>

        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 18,
          fontWeight: 500,
          color: "var(--text-secondary)",
          maxWidth: 560,
          lineHeight: 1.7,
          letterSpacing: "0.02em",
          marginBottom: 28,
          background: "rgba(10,10,10,0.6)",
          padding: "14px 18px",
          borderLeft: "2px solid rgba(196,30,42,0.4)",
        }}>
          Industry-leading research peptides synthesized to the highest standards.
          Every compound is independently verified — because precision is non-negotiable.
        </p>

        <div style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 36,
        }}>
          {["99%+ PURITY", "THIRD-PARTY TESTED", "RESEARCH USE ONLY", "FREE SHIPPING $200+"].map((badge, i) => (
            <span key={i} style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              padding: "8px 16px",
              border: "1px solid rgba(196,30,42,0.4)",
              color: "var(--red-primary)",
              animation: `fadeUp ${0.8 + i * 0.15}s ease-out`,
            }}>{badge}</span>
          ))}
        </div>

        <div style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <button onClick={() => navigate("/contact")} style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "16px 36px",
            background: "var(--red-primary)",
            border: "none",
            color: "var(--text-primary)",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
          }}>CONTACT US</button>
          <button onClick={() => navigate("/lab-results")} style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "16px 36px",
            background: "transparent",
            border: "1px solid var(--border-hover)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
          }}>VIEW LAB RESULTS</button>
        </div>

        {/* Animated stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 24,
          marginTop: 56,
          maxWidth: 720,
        }}>
          {[
            { value: 99, suffix: "%+", label: "Purity Verified" },
            { value: 25, suffix: "+", label: "Compounds" },
            { value: 200, prefix: "$", suffix: "+", label: "Free Shipping" },
            { value: 24, suffix: "h", label: "Order Processing" },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: "18px 16px",
              border: "1px solid rgba(196,30,42,0.2)",
              background: "rgba(10,10,10,0.5)",
              backdropFilter: "blur(8px)",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 800,
                fontSize: 32,
                color: "var(--red-primary)",
                letterSpacing: "0.02em",
                marginBottom: 4,
              }}><CountUp end={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix} duration={1800} /></div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom line */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: "10%",
        right: "10%",
        height: 1,
        background: "linear-gradient(to right, transparent, rgba(196,30,42,0.2), transparent)",
      }} />
    </section>
  );
}

function ProductCard({ product, index, onClick, onAddToCart }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="product-card"
      onClick={() => onClick(product)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? "var(--bg-card-hover)" : "var(--bg-card)",
        border: `1px solid ${hovered ? "rgba(196,30,42,0.3)" : "var(--border)"}`,
        cursor: "pointer",
        animation: `fadeUp ${0.4 + index * 0.05}s ease-out`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Scan line effect on hover */}
      {hovered && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          background: "linear-gradient(to bottom, transparent 40%, rgba(196,30,42,0.03) 50%, transparent 60%)",
          animation: "scanLine 2s linear infinite",
          pointerEvents: "none",
          zIndex: 2,
        }} />
      )}

      {/* Image */}
      <div style={{
        position: "relative",
        paddingTop: "100%",
        overflow: "hidden",
        background: "#080808",
      }}>
        <div className="product-card-inner" style={{ position: "absolute", inset: 0 }}>
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "16px 18px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}>{product.name}</div>

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 600,
          fontSize: 16,
          color: "var(--text-secondary)",
          marginBottom: 14,
        }}>{product.dose}</div>

        <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 26,
            color: "var(--text-primary)",
          }}>${product.price}</span>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            color: "var(--red-primary)",
            fontWeight: 700,
          }}>5+ @ ${product.bulk}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAddToCart(product); }}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "9px 0",
            background: "transparent",
            border: "1px solid var(--red-primary)",
            color: "var(--red-primary)",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
        >Add to Cart</button>
      </div>

      {/* Bottom accent line */}
      <div style={{
        height: 2,
        background: hovered
          ? "linear-gradient(to right, var(--red-primary), var(--red-dark), transparent)"
          : "linear-gradient(to right, rgba(196,30,42,0.15), transparent)",
        transition: "all 0.35s ease",
      }} />
    </div>
  );
}

function MolecularProfile({ product, compact }) {
  const profile = getMolecularProfile(product.name);
  if (!profile) return null;
  const isBlend = Array.isArray(profile.components);
  const sectionLabel = isBlend ? "Composition Profile" : "Molecular Profile";
  const rows = isBlend
    ? [
        { label: "Type", value: profile.type },
        ...profile.components.map(c => ({ label: c.name, value: `${c.dose} — ${c.role}` })),
        { label: "Total Content", value: profile.totalContent },
        { label: "Form", value: profile.form },
      ].filter(r => r.value)
    : [
        { label: "Type", value: profile.type },
        { label: "Amino acids", value: profile.aminoAcids },
        { label: "Molecular weight", value: profile.molecularWeight },
        { label: "CAS Number", value: profile.casNumber },
        { label: "Molecular formula", value: profile.molecularFormula },
        { label: "Modification", value: profile.modification },
      ].filter(r => r.value);

  if (compact) {
    return (
      <div style={{
        border: "1px solid var(--border)",
        background: "rgba(17,17,17,0.5)",
      }}>
        <div style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
        }}>{sectionLabel}</div>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: "grid",
            gridTemplateColumns: "minmax(100px, 32%) 1fr",
            alignItems: "baseline",
            gap: 12,
            padding: "9px 14px",
            borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-dim)",
              textTransform: "uppercase",
            }}>{row.label}</span>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              wordBreak: "break-word",
              lineHeight: 1.4,
            }}>{row.value}</span>
          </div>
        ))}
        {profile.pubchemCID && (
          <a
            href={`https://pubchem.ncbi.nlm.nih.gov/compound/${profile.pubchemCID}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "9px 14px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--red-primary)",
              textDecoration: "none",
            }}
          >PubChem — CID {profile.pubchemCID}</a>
        )}
      </div>
    );
  }

  return (
    <div style={{
      border: "1px solid var(--border)",
      background: "var(--bg-card)",
      padding: "24px 28px",
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.18em",
        color: "var(--red-primary)",
        textTransform: "uppercase",
        marginBottom: 10,
      }}>{sectionLabel}</div>
      <h3 style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: "0.02em",
        marginBottom: 18,
        color: "var(--text-primary)",
      }}>What is {product.name}?</h3>
      <div style={{
        border: "1px solid var(--border)",
        background: "rgba(17,17,17,0.5)",
      }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 35%) 1fr",
            alignItems: "baseline",
            gap: 16,
            padding: "12px 18px",
            borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--red-primary)",
              textTransform: "uppercase",
            }}>{row.label}</span>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              wordBreak: "break-word",
            }}>{row.value}</span>
          </div>
        ))}
      </div>
      {profile.pubchemCID && (
        <a
          href={`https://pubchem.ncbi.nlm.nih.gov/compound/${profile.pubchemCID}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 14,
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--red-primary)",
            textDecoration: "none",
          }}
        >PubChem — CID {profile.pubchemCID}</a>
      )}
    </div>
  );
}

function SourcesReferences({ product }) {
  const refs = getReferences(product.name);
  if (!refs || refs.length === 0) return null;
  const isMobile = window.innerWidth < 700;
  const profile = getMolecularProfile(product.name);
  const isBlend = Array.isArray(profile?.components);
  return (
    <div>
      <div style={{ marginBottom: isBlend ? 12 : 18 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}>{isBlend ? "Research on individual components" : "Peer-reviewed research"}</div>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.02em",
          color: "var(--text-primary)",
        }}>Sources &amp; References</div>
      </div>
      {isBlend && (
        <div style={{
          padding: "10px 14px",
          marginBottom: 16,
          border: "1px solid rgba(196,30,42,0.15)",
          background: "rgba(196,30,42,0.04)",
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}>No published clinical research exists on this specific blend formulation. Citations below reference the individual component compounds.</div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}>
        {refs.map((ref, i) => (
          <a
            key={i}
            href={ref.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "16px 18px",
              border: "1px solid var(--border)",
              background: "rgba(17,17,17,0.5)",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"; e.currentTarget.style.background = "rgba(196,30,42,0.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(17,17,17,0.5)"; }}
          >
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--red-primary)",
              marginBottom: 8,
              textTransform: "uppercase",
            }}>{ref.journal}</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.35,
              marginBottom: 8,
            }}>{ref.title}</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 13,
              color: "var(--text-dim)",
              marginBottom: ref.authors ? 6 : 10,
            }}>{ref.year ? `${ref.year} · ` : ""}{ref.identifier}</div>
            {ref.authors && (
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--text-secondary)",
                marginBottom: 10,
              }}>{ref.authors}</div>
            )}
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--red-primary)",
            }}>View Source ↗</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ProductQuickView({ product, onClose, onAddToCart, onViewDetails }) {
  const overlayRef = useRef(null);
  const isMobile = window.innerWidth < 700;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={e => e.target === overlayRef.current && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? 12 : 20,
        animation: "fadeIn 0.25s ease-out",
      }}
    >
      <div style={{
        position: "relative",
        background: "var(--bg-modal)",
        border: "1px solid rgba(196,30,42,0.2)",
        maxWidth: 800,
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Close button */}
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            width: 32,
            height: 32,
            border: "1px solid var(--border)",
            background: "rgba(10,10,10,0.9)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            fontWeight: 300,
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.borderColor = "var(--red-primary)"; e.target.style.color = "var(--red-primary)"; }}
          onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
        >✕</button>

        {/* Image */}
        <div style={{
          background: "#080808",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          height: isMobile ? 280 : 360,
        }}>
          <img src={product.image} alt={product.name} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", padding: 16 }} />
        </div>

        {/* Info */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile || !getMolecularProfile(product.name) ? "1fr" : "1fr 1fr",
            gap: 20,
            marginBottom: 16,
          }}>
            {/* Left column: name, price, purity */}
            <div>
              <h2 style={{
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "0.03em",
                lineHeight: 1.1,
                marginBottom: 4,
              }}>{product.name}</h2>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 16,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}>{product.dose}</div>

              {/* Price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 24 }}>${product.price}</span>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)" }}>/vial</span>
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--red-primary)", fontWeight: 700, marginBottom: 16 }}>5+ Vials: ${product.bulk} each</div>

              {/* Purity + Form */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[{ label: "PURITY", value: product.purity }, { label: "FORM", value: "Lyophilized" }].map((s, i) => (
                  <div key={i} style={{ padding: "8px 12px", border: "1px solid var(--border)" }}>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column: molecular profile */}
            {getMolecularProfile(product.name) && (
              <div>
                <MolecularProfile product={product} compact />
              </div>
            )}
          </div>

          {/* Buttons */}
          <button onClick={() => onAddToCart(product)} style={{
            width: "100%",
            padding: "12px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
            marginBottom: 10,
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >ADD TO CART</button>

          <button onClick={() => { onClose(); onViewDetails(product); }} style={{
            width: "100%",
            padding: "12px 0",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.target.style.borderColor = "var(--red-primary)"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
          >VIEW FULL DETAILS</button>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  const navigate = useNavigate();
  const linkStyle = {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
    textDecoration: "none",
    transition: "color 0.2s",
    display: "block",
    padding: "4px 0",
  };
  const headingStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.15em",
    color: "var(--red-primary)",
    textTransform: "uppercase",
    marginBottom: 14,
  };
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      paddingTop: 60,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "0 24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 40,
        marginBottom: 40,
      }}>
        <div>
          <div style={headingStyle}>Tier One Bio</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}>
            Research-grade peptides with 99%+ purity. Lot-tested and US-based.
          </div>
        </div>

        <div>
          <div style={headingStyle}>Shop</div>
          <a onClick={() => navigate("/products")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>All Products</a>
          <a onClick={() => navigate("/research")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Research</a>
          <a onClick={() => navigate("/lab-results")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Lab Results</a>
          <a onClick={() => navigate("/calculator")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Reconstitution Calculator</a>
        </div>

        <div>
          <div style={headingStyle}>Info</div>
          <a onClick={() => navigate("/about")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>About</a>
          <a onClick={() => navigate("/faq")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>FAQ</a>
          <a onClick={() => navigate("/testing-standards")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Testing Standards</a>
          <a onClick={() => navigate("/contact")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Contact</a>
        </div>

        <div>
          <div style={headingStyle}>Policies</div>
          <a onClick={() => navigate("/shipping")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Shipping</a>
          <a onClick={() => navigate("/returns")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Returns</a>
          <a onClick={() => navigate("/terms")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Terms of Service</a>
          <a onClick={() => navigate("/privacy")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Privacy Policy</a>
        </div>
      </div>

      <div style={{
        borderTop: "1px solid var(--border)",
        padding: "28px 24px",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "0.15em",
          marginBottom: 6,
        }}>TIER ONE BIOSYSTEMS</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 12,
          color: "var(--text-dim)",
          marginBottom: 16,
          lineHeight: 1.6,
        }}>
          All products are sold for research and laboratory use only.
          <br />Not for human consumption. Not a drug, food, or cosmetic.
        </div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 12,
          color: "var(--text-secondary)",
          letterSpacing: "0.05em",
        }}>© 2026 Tier One BioSystems. All rights reserved.</div>
      </div>
    </footer>
  );
}

// ─── Syringe Diagram ─────────────────────────────────────────────────────────

function SyringeDiagram({ units }) {
  const BL = 100, BR = 460, BT = 28, BH = 26;
  const BB = BT + BH, BW = BR - BL, CY = BT + BH / 2;
  const safe = Math.min(100, Math.max(0, units || 0));
  const fillW = (safe / 100) * (BW - 2);

  return (
    <div style={{ padding: "0 0 14px" }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.15em",
        color: "var(--red-primary)",
        textTransform: "uppercase",
        marginBottom: 2,
        textAlign: "center",
      }}>Syringe Fill</div>

      <svg viewBox="0 0 560 88" width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Plunger handle */}
        <rect x={8} y={BT - 8} width={16} height={BH + 16} rx={3}
          fill="none" stroke="rgba(196,30,42,0.5)" strokeWidth={2} />
        {/* Plunger rod */}
        <rect x={24} y={CY - 3} width={BL - 30} height={6}
          fill="rgba(196,30,42,0.2)" />
        {/* Plunger stopper */}
        <rect x={BL - 5} y={BT} width={7} height={BH} rx={2}
          fill="rgba(196,30,42,0.5)" />

        {/* Red fill — starts from needle side (right) */}
        <rect
          x={BR - 1 - fillW} y={BT + 1} height={BH - 2}
          width={fillW}
          fill="rgba(196,30,42,0.65)"
          style={{ transition: "width 0.7s cubic-bezier(0.4,0,0.2,1), x 0.7s cubic-bezier(0.4,0,0.2,1)" }}
        />

        {/* Barrel */}
        <rect x={BL} y={BT} width={BW} height={BH} rx={3}
          fill="none" stroke="rgba(196,30,42,0.4)" strokeWidth={2} />

        {/* Graduation marks + labels — 0 at needle side (right), 100 at plunger (left) */}
        {[0,10,20,30,40,50,60,70,80,90,100].map(n => {
          const x = BL + (n / 100) * BW;
          const label = 100 - n;
          return (
            <g key={n}>
              <line x1={x} y1={BB} x2={x} y2={BB + 8}
                stroke="rgba(196,30,42,0.5)" strokeWidth={1.5} />
              <text x={x} y={BB + 18}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize={8}
                fontFamily="'Orbitron', sans-serif">{label}</text>
            </g>
          );
        })}

        {/* Needle — extends straight from barrel */}
        <line x1={BR} y1={CY} x2={BR + 60} y2={CY}
          stroke="rgba(190,190,190,0.85)" strokeWidth={1.5} />
      </svg>

      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 13,
        color: units ? "var(--text-primary)" : "var(--text-secondary)",
        marginTop: 4,
        letterSpacing: "0.05em",
        textAlign: "center",
      }}>
        {units ? `${Math.round(units)} / 100 units` : "awaiting input"}
      </div>
    </div>
  );
}

// ─── Peptide Calculator ───────────────────────────────────────────────────────

function PeptideCalculator() {
  usePageMeta("Peptide Reconstitution Calculator", "Free peptide reconstitution calculator. Calculate BAC water volume, concentration, and syringe units for research peptide preparation.");
  const [vialMg, setVialMg] = useState("");
  const [waterMl, setWaterMl] = useState("");
  const [doseValue, setDoseValue] = useState("");
  const [doseUnit, setDoseUnit] = useState("mcg");

  const doseMcg = doseValue ? (doseUnit === "mg" ? parseFloat(doseValue) * 1000 : parseFloat(doseValue)) : null;
  function fmt(n) {
    if (!n) return "—";
    const one = parseFloat(n.toFixed(1));
    return one > 0 ? n.toFixed(1) : parseFloat(n.toPrecision(2)).toString();
  }

  const concentration = vialMg && waterMl ? parseFloat(vialMg) / parseFloat(waterMl) : null;
  const volumeMl = concentration && doseMcg ? (doseMcg / 1000) / concentration : null;
  const insulinUnits = volumeMl ? volumeMl * 100 : null;

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(17,17,17,0.8)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    fontWeight: 500,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>Research Tools</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 42px)",
          color: "var(--text-primary)",
          letterSpacing: "0.03em",
          marginBottom: 16,
          textTransform: "uppercase",
        }}>Peptide Reconstitution<br />Calculator</h2>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          color: "var(--text-secondary)",
          maxWidth: 520,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>Enter your vial size, how much BAC water you're adding, and your desired dose to calculate exactly how much to draw.</p>
      </div>

      {/* Inputs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 24,
        marginBottom: 40,
      }}>
        <div>
          <label style={labelStyle}>Vial Size (mg)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 5"
            value={vialMg}
            onChange={e => setVialMg(e.target.value)}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        <div>
          <label style={labelStyle}>BAC Water Added (mL)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 2"
            value={waterMl}
            onChange={e => setWaterMl(e.target.value)}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        <div>
          <label style={labelStyle}>Desired Dose</label>
          <div style={{ display: "flex", gap: 0 }}>
            <input
              type="number"
              min="0"
              placeholder={doseUnit === "mcg" ? "e.g. 250" : "e.g. 0.25"}
              value={doseValue}
              onChange={e => setDoseValue(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
            {["mcg", "mg"].map(unit => (
              <button
                key={unit}
                onClick={() => setDoseUnit(unit)}
                style={{
                  padding: "0 16px",
                  background: doseUnit === unit ? "var(--red-primary)" : "rgba(17,17,17,0.8)",
                  border: "1px solid var(--border)",
                  borderLeft: "none",
                  color: doseUnit === unit ? "#fff" : "var(--text-secondary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  transition: "all 0.2s",
                }}
              >{unit}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{
        border: "1px solid rgba(196,30,42,0.3)",
        background: "rgba(17,17,17,0.6)",
        padding: "32px",
        marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 24,
        }}>Results</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24 }}>
          {[
            {
              label: "Concentration",
              value: concentration ? `${fmt(concentration)} mg/mL` : "—",
              sub: "after reconstitution",
            },
            {
              label: "Syringe",
              value: insulinUnits ? `${Math.round(insulinUnits)} units` : "—",
              sub: "on a 100-unit syringe",
            },
          ].map((r, i) => (
            <div key={i} style={{
              borderLeft: "2px solid rgba(196,30,42,0.4)",
              paddingLeft: 16,
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 13,
                letterSpacing: "0.1em",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>{r.label}</div>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 26,
                fontWeight: 700,
                color: concentration ? "var(--text-primary)" : "var(--text-secondary)",
                marginBottom: 4,
              }}>{r.value}</div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 16,
                color: "var(--text-secondary)",
              }}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Syringe */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          <SyringeDiagram units={insulinUnits} />
        </div>
      </div>

      {/* How it works */}
      <div style={{
        border: "1px solid var(--border)",
        background: "rgba(17,17,17,0.4)",
        padding: "28px 32px",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>How to Use</div>
        <ol style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 18,
          color: "var(--text-secondary)",
          lineHeight: 2,
          paddingLeft: 20,
          margin: 0,
        }}>
          <li>Draw your desired amount of BAC water into a syringe.</li>
          <li>Slowly inject it down the side of the vial — do not shake.</li>
          <li>Gently swirl until the powder is fully dissolved.</li>
          <li>Using the result above, draw the calculated units into a fresh syringe for each dose.</li>
          <li>Store reconstituted solution in the refrigerator and use within the timeframe listed on your product.</li>
        </ol>
      </div>

      <div style={{
        marginTop: 24,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        color: "var(--text-secondary)",
        textAlign: "center",
        lineHeight: 1.6,
        opacity: 0.7,
      }}>For research use only. This calculator is provided as a convenience tool. Always verify calculations independently.</div>
    </div>
  );
}

// ─── Contact Page ────────────────────────────────────────────────────────────

function ContactPage() {
  usePageMeta("Contact Us", "Get in touch with Tier One BioSystems. Questions about research peptides, orders, or wholesale inquiries.");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(17,17,17,0.8)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  function handleSubmit(e) {
    e.preventDefault();
    const formData = new URLSearchParams();
    formData.append("form-name", "contact");
    formData.append("name", form.name);
    formData.append("email", form.email);
    formData.append("subject", form.subject);
    formData.append("message", form.message);
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).then((res) => {
      if (res.ok) setSubmitted(true);
      else console.error("Form submission failed:", res.status);
    }).catch((err) => console.error("Form error:", err));
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>Get In Touch</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 42px)",
          color: "var(--text-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>Contact Us</h2>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
        }}>Questions about our products, orders, or research support? We'll get back to you within 24 hours.</p>
      </div>

      {submitted ? (
        <div style={{
          border: "1px solid rgba(196,30,42,0.4)",
          background: "rgba(17,17,17,0.6)",
          padding: "48px 32px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 12,
          }}>Message Sent</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 17,
            color: "var(--text-secondary)",
          }}>We'll be in touch within 24 hours.</div>
        </div>
      ) : (
        <form name="contact" method="POST" data-netlify="true" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <input type="hidden" name="form-name" value="contact" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input required type="text" placeholder="Your name" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input required type="email" placeholder="your@email.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Subject</label>
            <input type="text" placeholder="Order inquiry, product question..." value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"} />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea required placeholder="How can we help?" value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              rows={6}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"} />
          </div>
          <button type="submit" style={{
            padding: "14px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >Send Message</button>
        </form>
      )}
    </div>
  );
}

// ─── Cart Page ────────────────────────────────────────────────────────────────

// Discount codes are validated server-side via a Netlify Function that reads
// them from environment variables. Codes are never included in the client
// bundle. See netlify/functions/validate-discount.js.

function CartPage({ cart, setCart }) {
  usePageMeta("Your Cart", "Review your order and checkout at Tier One BioSystems.");
  const navigate = useNavigate();
  const [step, setStep] = useState("cart"); // cart, info, payment, confirmed
  const [customerInfo, setCustomerInfo] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  });
  const [orderNumber, setOrderNumber] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [paymentMethod, setPaymentMethod] = useState("cashapp"); // cashapp | venmo
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null); // { code, type, value, label } — order discount slot
  const [appliedShipping, setAppliedShipping] = useState(null); // { code, type, value, label } — free-shipping slot
  const [discountError, setDiscountError] = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [returnedFromPayment, setReturnedFromPayment] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  function updateQty(id, delta) {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, qty: item.qty + delta } : item)
      .filter(item => item.qty > 0)
    );
  }

  // Calculate price per item with tiered bulk discounts
  // 1-4: regular price | 5-9: bulk | 10-24: bulk -5% | 25+: bulk -10%
  function getItemPrice(item) {
    if (item.qty >= 25) return Math.round(item.bulk * 0.90 * 100) / 100;
    if (item.qty >= 10) return Math.round(item.bulk * 0.95 * 100) / 100;
    if (item.qty >= 5) return item.bulk;
    return item.price;
  }

  const subtotal = cart.reduce((sum, item) => sum + getItemPrice(item) * item.qty, 0);

  // Calculate discount amount based on applied code
  const discountAmount = appliedDiscount
    ? appliedDiscount.type === "percent"
      ? Math.min(subtotal, subtotal * (appliedDiscount.value / 100))
      : Math.min(subtotal, appliedDiscount.value)
    : 0;
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  // Shipping: $10 flat, free at $200+, also free if a shipping discount code is applied
  const shipping = cart.length === 0
    ? 0
    : appliedShipping
      ? 0
      : (subtotalAfterDiscount >= 200 ? 0 : 10);
  const total = subtotalAfterDiscount + shipping;

  // Codes that unlock the free-shipping slot instead of the regular discount slot
  const SHIPPING_DISCOUNT_CODES = ["SHIP4FREE"];
  const isShippingDiscount = (code) => SHIPPING_DISCOUNT_CODES.includes(code);

  async function applyDiscountCode() {
    const code = discountInput.trim().toUpperCase();
    if (!code) {
      setDiscountError("Enter a discount code.");
      return;
    }
    if ((appliedDiscount && appliedDiscount.code === code) || (appliedShipping && appliedShipping.code === code)) {
      setDiscountError("That code is already applied.");
      return;
    }
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/.netlify/functions/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({ valid: false, error: "Could not reach discount service." }));
      if (!res.ok || !data.valid) {
        setDiscountError(data.error || "Invalid discount code.");
        return;
      }
      const appliedCode = {
        code: data.code,
        type: data.type,
        value: data.value,
        label: data.label,
      };
      if (isShippingDiscount(data.code)) {
        if (appliedShipping) {
          setDiscountError("A free-shipping code is already applied.");
          return;
        }
        setAppliedShipping(appliedCode);
      } else {
        if (appliedDiscount) {
          setDiscountError("A discount code is already applied. Remove it before adding another.");
          return;
        }
        setAppliedDiscount(appliedCode);
      }
      setDiscountInput("");
      setDiscountError("");
    } catch (err) {
      console.error("Discount validation error:", err);
      setDiscountError("Could not reach discount service. Try again.");
    } finally {
      setDiscountLoading(false);
    }
  }

  function removeDiscountCode() {
    setAppliedDiscount(null);
    setDiscountError("");
  }
  function removeShippingCode() {
    setAppliedShipping(null);
    setDiscountError("");
  }

  function generateOrderNumber() {
    const date = new Date();
    const y = date.getFullYear().toString().slice(-2);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `T1B-${y}${m}${d}-${rand}`;
  }

  function handleCheckout() {
    // Validate fields
    const { name, email, phone, address, city, state, zip } = customerInfo;
    if (!name || !email || !phone || !address || !city || !state || !zip) return;

    const num = generateOrderNumber();
    setOrderNumber(num);
    setStep("payment");
  }

  // Fires when the user clicks "Open Cash App" / "Open Venmo".
  // Sends a "PENDING_PAYMENT" notification so the owner sees the order
  // attempt even if the customer never returns to click confirm.
  function handlePaymentInitiated(method) {
    if (paymentInitiated) return; // one-shot per checkout
    setPaymentInitiated(true);
    const { name, email, phone, address, city, state, zip } = customerInfo;
    const itemsText = cart.map(item => {
      const unitPrice = getItemPrice(item);
      const isBulk = item.qty >= 5;
      return `${item.name} ${item.dose} x${item.qty} @ $${unitPrice.toFixed(2)}${isBulk ? " (bulk)" : ""} = $${(unitPrice * item.qty).toFixed(2)}`;
    }).join("\n");
    const formData = new URLSearchParams();
    formData.append("form-name", "order");
    formData.append("orderStatus", "PENDING_PAYMENT");
    formData.append("orderNumber", orderNumber);
    formData.append("customerName", name);
    formData.append("customerEmail", email);
    formData.append("customerPhone", phone);
    formData.append("shippingAddress", address);
    formData.append("shippingCity", city);
    formData.append("shippingState", state);
    formData.append("shippingZip", zip);
    formData.append("orderItems", itemsText);
    formData.append("orderSubtotal", `$${subtotal.toFixed(2)}`);
    formData.append("discountCode", [appliedDiscount?.code, appliedShipping?.code].filter(Boolean).join(", "));
    formData.append("discountAmount", appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "");
    formData.append("shipping", shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`);
    formData.append("paymentMethod", method);
    formData.append("orderTotal", `$${total.toFixed(2)}`);
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).catch((err) => console.error("Pending payment notification error:", err));
  }

  // Watch for the customer returning to the tab after going to Cash App / Venmo.
  // Trigger the "welcome back, please confirm" UI (banner + auto-scroll + pulse).
  useEffect(() => {
    if (step !== "payment" || !paymentInitiated) return;
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        setReturnedFromPayment(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    const originalTitle = document.title;
    document.title = "← Confirm payment · Tier One BioSystems";
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.title = originalTitle;
    };
  }, [step, paymentInitiated]);

  // When the return-banner appears, scroll to the confirm button so it's right under the customer's thumb.
  useEffect(() => {
    if (!returnedFromPayment) return;
    const btn = document.getElementById("confirm-payment-btn");
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [returnedFromPayment]);

  function handlePaymentConfirmed() {
    const { name, email, phone, address, city, state, zip } = customerInfo;

    // Build order items text
    const itemsText = cart.map(item => {
      const unitPrice = getItemPrice(item);
      const isBulk = item.qty >= 5;
      return `${item.name} ${item.dose} x${item.qty} @ $${unitPrice.toFixed(2)}${isBulk ? " (bulk)" : ""} = $${(unitPrice * item.qty).toFixed(2)}`;
    }).join("\n");

    // Submit to Netlify Forms
    const formData = new URLSearchParams();
    formData.append("form-name", "order");
    formData.append("orderStatus", "CONFIRMED");
    formData.append("orderNumber", orderNumber);
    formData.append("customerName", name);
    formData.append("customerEmail", email);
    formData.append("customerPhone", phone);
    formData.append("shippingAddress", address);
    formData.append("shippingCity", city);
    formData.append("shippingState", state);
    formData.append("shippingZip", zip);
    formData.append("orderItems", itemsText);
    formData.append("orderSubtotal", `$${subtotal.toFixed(2)}`);
    formData.append("discountCode", [appliedDiscount?.code, appliedShipping?.code].filter(Boolean).join(", "));
    formData.append("discountAmount", appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "");
    formData.append("shipping", shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`);
    formData.append("paymentMethod", paymentMethod === "venmo" ? "Venmo" : "Cash App");
    formData.append("orderTotal", `$${total.toFixed(2)}`);

    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).then((res) => {
      if (!res.ok) console.error("Order submission failed:", res.status);
    }).catch((err) => console.error("Order error:", err));

    // Send confirmation email to customer via EmailJS
    emailjs.send("service_r3r7crs", "template_i9k8u2a", {
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      orderNumber: orderNumber,
      orderItems: itemsText,
      orderSubtotal: `$${subtotal.toFixed(2)}`,
      discountCode: [appliedDiscount?.code, appliedShipping?.code].filter(Boolean).join(", "),
      discountAmount: appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "",
      shipping: shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`,
      paymentMethod: paymentMethod === "venmo" ? "Venmo" : "Cash App",
      orderTotal: `$${total.toFixed(2)}`,
      shippingAddress: address,
      shippingCity: city,
      shippingState: state,
      shippingZip: zip,
    }, "E2QQt-tqFcuyhtZOD").then(() => {
      console.log("Confirmation email sent");
    }).catch((err) => console.error("Email error:", err));

    setStep("confirmed");
    setCart([]);
  }

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(17,17,17,0.8)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 120px 80px" : "1fr auto auto",
    alignItems: "center",
    gap: isMobile ? 12 : 24,
    padding: "20px 0",
    borderBottom: "1px solid var(--border)",
  };

  // ─── Order Confirmed Screen ──────────────────────────
  if (step === "confirmed") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px", textAlign: "center" }}>
        <div style={{
          border: "1px solid rgba(34,197,94,0.3)",
          background: "rgba(34,197,94,0.03)",
          padding: "48px 32px",
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22c55e",
            marginBottom: 16,
          }}>ORDER SUBMITTED</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
            marginBottom: 12,
          }}>THANK YOU!</h2>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 17,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: 24,
          }}>
            Your order has been received. Please allow up to 24 hours for payment confirmation
            and order processing.
          </p>
          <div style={{
            padding: "16px 24px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "inline-block",
            marginBottom: 24,
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--text-dim)",
              marginBottom: 4,
            }}>ORDER NUMBER</div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 22,
              fontWeight: 800,
              color: "var(--red-primary)",
              letterSpacing: "0.05em",
            }}>{orderNumber}</div>
          </div>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-dim)",
            lineHeight: 1.6,
          }}>
            Save your order number for reference. A confirmation has been sent to your email.
          </p>
        </div>
        <button onClick={() => { setStep("cart"); navigate("/"); }} style={{
          padding: "14px 36px",
          background: "var(--red-primary)",
          border: "1px solid var(--red-primary)",
          color: "#fff",
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "all 0.2s",
        }}>Continue Shopping</button>
      </div>
    );
  }

  // ─── Payment Screen ──────────────────────────────────
  if (step === "payment") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>STEP 3 OF 3</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
          }}>SEND PAYMENT</h2>
        </div>

        <div style={{
          border: "1px solid var(--border)",
          background: "rgba(17,17,17,0.4)",
          padding: "32px",
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "var(--red-primary)",
            marginBottom: 16,
          }}>ORDER SUMMARY</div>
          <div style={{
            padding: "12px 16px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>ORDER NUMBER</span>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--red-primary)" }}>{orderNumber}</span>
          </div>
          {appliedDiscount && (
            <>
              <div style={{
                padding: "12px 16px",
                border: "1px solid var(--border)",
                background: "rgba(17,17,17,0.5)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>SUBTOTAL</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{
                padding: "12px 16px",
                border: "1px solid var(--border)",
                background: "rgba(17,17,17,0.5)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "#22c55e" }}>DISCOUNT ({appliedDiscount.code})</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "#22c55e" }}>−${discountAmount.toFixed(2)}</span>
              </div>
            </>
          )}
          <div style={{
            padding: "12px 16px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>SHIPPING</span>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: shipping === 0 ? "#22c55e" : "var(--text-secondary)" }}>
              {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
            </span>
          </div>
          <div style={{
            padding: "12px 16px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>TOTAL DUE</span>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>${total.toFixed(2)}</span>
          </div>
        </div>

        <div style={{
          border: "1px solid rgba(34,197,94,0.3)",
          background: "rgba(34,197,94,0.03)",
          padding: "32px",
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22c55e",
            marginBottom: 20,
          }}>PAYMENT INSTRUCTIONS</div>

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 16,
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            marginBottom: 24,
          }}>
            <p style={{ margin: "0 0 16px", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>Step 1: Copy your order number</p>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              border: "1px solid var(--border)",
              background: "rgba(17,17,17,0.5)",
              marginBottom: 20,
            }}>
              <span style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--red-primary)",
                letterSpacing: "0.05em",
              }}>{orderNumber}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(orderNumber);
                  const btn = document.getElementById("copy-btn");
                  if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 2000); }
                }}
                id="copy-btn"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(34,197,94,0.3)",
                  color: "#22c55e",
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "6px 14px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(34,197,94,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </button>
            </div>

            <p style={{ margin: "0 0 12px", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>Step 2: Choose payment method</p>

            {/* Payment method tabs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setPaymentMethod("cashapp")}
                style={{
                  padding: "12px 0",
                  background: paymentMethod === "cashapp" ? "rgba(0,214,50,0.1)" : "transparent",
                  border: paymentMethod === "cashapp" ? "1px solid #00D632" : "1px solid var(--border)",
                  color: paymentMethod === "cashapp" ? "#00D632" : "var(--text-secondary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >Cash App</button>
              <button
                onClick={() => setPaymentMethod("venmo")}
                style={{
                  padding: "12px 0",
                  background: paymentMethod === "venmo" ? "rgba(0,143,227,0.1)" : "transparent",
                  border: paymentMethod === "venmo" ? "1px solid #008CFF" : "1px solid var(--border)",
                  color: paymentMethod === "venmo" ? "#008CFF" : "var(--text-secondary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >Venmo</button>
            </div>

            {paymentMethod === "cashapp" ? (
              <>
                <p style={{ margin: "0 0 8px" }}>Send <strong style={{ color: "var(--text-primary)" }}>${total.toFixed(2)}</strong> to <strong style={{ color: "#00D632" }}>$TierOneBio</strong></p>
                <p style={{ margin: "0 0 20px", color: "var(--text-dim)", fontSize: 14 }}>Paste the order number in the Cash App note so we can match your payment.</p>

                <a
                  href={`https://cash.app/$TierOneBio/${total.toFixed(2)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handlePaymentInitiated("Cash App")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    width: "100%",
                    padding: "16px 0",
                    background: "#00D632",
                    border: "none",
                    color: "#fff",
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxSizing: "border-box",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                    <path d="M23.59 3.47A5.1 5.1 0 0 0 20.55.42 5.07 5.07 0 0 0 17.13 0H6.87a5.07 5.07 0 0 0-3.42.42A5.1 5.1 0 0 0 .42 3.47 5.07 5.07 0 0 0 0 6.87v10.26a5.07 5.07 0 0 0 .42 3.42 5.1 5.1 0 0 0 3.05 3.05 5.07 5.07 0 0 0 3.42.42h10.26a5.07 5.07 0 0 0 3.42-.42 5.1 5.1 0 0 0 3.05-3.05 5.07 5.07 0 0 0 .42-3.42V6.87a5.1 5.1 0 0 0-.45-3.4zM17.4 10.29l-.87.87a.46.46 0 0 1-.36.15.48.48 0 0 1-.36-.15c-.87-.87-1.32-.87-1.56-.87-.42 0-.78.36-.78.78 0 .18.06.36.18.48.12.12.24.18.42.24l.84.3c1.38.48 2.22 1.38 2.22 2.94a3.09 3.09 0 0 1-2.1 3v.84a.48.48 0 0 1-.48.48h-.96a.48.48 0 0 1-.48-.48v-.78a4.03 4.03 0 0 1-2.1-1.14.48.48 0 0 1 0-.66l.84-.84a.48.48 0 0 1 .66 0c.72.66 1.32.84 1.8.84a1.2 1.2 0 0 0 1.2-1.2c0-.42-.24-.78-1.08-1.08l-.78-.3c-.96-.36-2.28-1.08-2.28-2.88a2.79 2.79 0 0 1 1.98-2.64v-.78a.48.48 0 0 1 .48-.48h.96a.48.48 0 0 1 .48.48v.72a3.3 3.3 0 0 1 1.68.9.48.48 0 0 1 .06.66z" />
                  </svg>
                  OPEN CASH APP
                </a>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 8px" }}>Send <strong style={{ color: "var(--text-primary)" }}>${total.toFixed(2)}</strong> to <strong style={{ color: "#008CFF" }}>@TierOneBio</strong></p>
                <p style={{ margin: "0 0 20px", color: "var(--text-dim)", fontSize: 14 }}>Paste the order number in the Venmo note so we can match your payment.</p>

                <a
                  href={`https://venmo.com/u/TierOneBio?txn=pay&amount=${total.toFixed(2)}&note=${encodeURIComponent(orderNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handlePaymentInitiated("Venmo")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    width: "100%",
                    padding: "16px 0",
                    background: "#008CFF",
                    border: "none",
                    color: "#fff",
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxSizing: "border-box",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                    <path d="M19.59 0H4.41A4.41 4.41 0 0 0 0 4.41v15.18A4.41 4.41 0 0 0 4.41 24h15.18A4.41 4.41 0 0 0 24 19.59V4.41A4.41 4.41 0 0 0 19.59 0zm-3.34 18.7H8.13L4.93 5.16h3.94l1.74 9.13c.46-.74 1.03-1.92 1.03-2.72 0-2.21-1.94-3.7-1.94-3.7l3.05-2.71c1.55 1.74 2.4 3.61 2.4 6.02 0 3.07-2.62 7.08-3 7.52z" />
                  </svg>
                  OPEN VENMO
                </a>
              </>
            )}

            {/* MUST-RETURN warning — shown before they leave so they know to come back and confirm */}
            <div style={{
              marginTop: 20,
              padding: "14px 16px",
              border: "1px solid rgba(245,158,11,0.5)",
              background: "rgba(245,158,11,0.08)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1.3 }}>⚠️</span>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <strong style={{ color: "#f59e0b" }}>Don't close this page.</strong> After you send payment in {paymentMethod === "venmo" ? "Venmo" : "Cash App"}, <strong style={{ color: "var(--text-primary)" }}>come back here</strong> and tap <strong style={{ color: "var(--text-primary)" }}>"I have sent payment"</strong> below. Your order will not be processed until you confirm it here.
              </span>
            </div>

            <p style={{ margin: "20px 0 0", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>
              Step 3: {paymentInitiated ? "Confirm your payment below" : "Confirm below — after you've paid"}
            </p>
          </div>
        </div>

        {returnedFromPayment && (
          <div style={{
            padding: "14px 18px",
            marginBottom: 16,
            border: "1px solid #22c55e",
            background: "rgba(34,197,94,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "pulseReturn 1.6s ease-in-out infinite",
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#22c55e",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}>Welcome back</span>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.4,
            }}>Once your payment is sent, tap "I have sent payment" below to finalize your order.</span>
          </div>
        )}

        {paymentInitiated ? (
          <button id="confirm-payment-btn" onClick={handlePaymentConfirmed} style={{
            width: "100%",
            padding: "16px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
            marginBottom: 16,
            boxShadow: returnedFromPayment ? "0 0 0 0 rgba(196,30,42,0.6)" : "none",
            animation: returnedFromPayment ? "pulseConfirm 1.6s ease-out infinite" : "none",
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >I HAVE SENT PAYMENT</button>
        ) : (
          <div style={{
            width: "100%",
            padding: "16px 0",
            border: "1px dashed var(--border)",
            background: "rgba(17,17,17,0.4)",
            color: "var(--text-dim)",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 1.5,
            marginBottom: 16,
            boxSizing: "border-box",
          }}>
            Tap <strong style={{ color: "var(--text-secondary)" }}>Open {paymentMethod === "venmo" ? "Venmo" : "Cash App"}</strong> above first.<br />Your confirmation button will appear here once you do.
          </div>
        )}

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 14,
          color: "var(--text-dim)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          Orders are processed within 24 hours of payment confirmation.
          <br />If you have questions, contact us at info@tierone.bio
        </div>
      </div>
    );
  }

  // ─── Customer Info Screen ────────────────────────────
  if (step === "info") {
    const allFilled = customerInfo.name && customerInfo.email && customerInfo.phone &&
      customerInfo.address && customerInfo.city && customerInfo.state && customerInfo.zip;

    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>STEP 2 OF 3</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
          }}>SHIPPING DETAILS</h2>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (allFilled) handleCheckout(); }} style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>
          <input type="hidden" name="form-name" value="order" />

          <div>
            <label style={labelStyle}>Full Name *</label>
            <input
              type="text"
              required
              value={customerInfo.name}
              onChange={e => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
              style={inputStyle}
              placeholder="John Doe"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                required
                value={customerInfo.email}
                onChange={e => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))}
                style={inputStyle}
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label style={labelStyle}>Phone *</label>
              <input
                type="tel"
                required
                value={customerInfo.phone}
                onChange={e => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                style={inputStyle}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Street Address *</label>
            <input
              type="text"
              required
              value={customerInfo.address}
              onChange={e => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
              style={inputStyle}
              placeholder="123 Main St, Apt 4"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20 }}>
            <div>
              <label style={labelStyle}>City *</label>
              <input
                type="text"
                required
                value={customerInfo.city}
                onChange={e => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                style={inputStyle}
                placeholder="Austin"
              />
            </div>
            <div>
              <label style={labelStyle}>State *</label>
              <input
                type="text"
                required
                value={customerInfo.state}
                onChange={e => setCustomerInfo(prev => ({ ...prev, state: e.target.value }))}
                style={inputStyle}
                placeholder="TX"
              />
            </div>
            <div>
              <label style={labelStyle}>Zip Code *</label>
              <input
                type="text"
                required
                value={customerInfo.zip}
                onChange={e => setCustomerInfo(prev => ({ ...prev, zip: e.target.value }))}
                style={inputStyle}
                placeholder="78701"
              />
            </div>
          </div>

          {/* Order summary */}
          <div style={{
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.4)",
            padding: "20px 24px",
            marginTop: 8,
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--text-dim)",
              marginBottom: 12,
            }}>ORDER SUMMARY</div>
            {cart.map(item => {
              const unitPrice = getItemPrice(item);
              const isBulk = item.qty >= 5;
              return (
                <div key={item.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 15,
                  color: "var(--text-secondary)",
                  padding: "4px 0",
                }}>
                  <span>{item.name} {item.dose} x{item.qty}{isBulk ? " (bulk)" : ""}</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${(unitPrice * item.qty).toFixed(2)}</span>
                </div>
              );
            })}
            {appliedDiscount && (
              <>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 15,
                  color: "var(--text-secondary)",
                  padding: "4px 0",
                  borderTop: "1px solid var(--border)",
                  marginTop: 8,
                  paddingTop: 10,
                }}>
                  <span>Subtotal</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
                </div>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 15,
                  color: "#22c55e",
                  padding: "4px 0",
                }}>
                  <span>Discount ({appliedDiscount.code})</span>
                  <span style={{ fontWeight: 600 }}>−${discountAmount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              color: "var(--text-secondary)",
              padding: "4px 0",
              borderTop: appliedDiscount ? "none" : "1px solid var(--border)",
              marginTop: appliedDiscount ? 0 : 8,
              paddingTop: appliedDiscount ? 4 : 10,
            }}>
              <span>Shipping</span>
              <span style={{ color: shipping === 0 ? "#22c55e" : "var(--text-primary)", fontWeight: 600 }}>
                {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
              </span>
            </div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid var(--border)",
              marginTop: 12,
              paddingTop: 12,
            }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, letterSpacing: "0.1em", color: "var(--text-secondary)" }}>TOTAL</span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>${total.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <button type="button" onClick={() => setStep("cart")} style={{
              flex: 1,
              padding: "14px 0",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}>Back to Cart</button>
            <button type="submit" style={{
              flex: 2,
              padding: "14px 0",
              background: allFilled ? "var(--red-primary)" : "rgba(196,30,42,0.3)",
              border: "1px solid var(--red-primary)",
              color: allFilled ? "#fff" : "rgba(255,255,255,0.4)",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: allFilled ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}>Proceed to Payment</button>
          </div>
        </form>
      </div>
    );
  }

  // ─── Cart Screen (Step 1) ────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>STEP 1 OF 3</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 42px)",
          color: "var(--text-primary)",
          textTransform: "uppercase",
        }}>YOUR CART</h2>
      </div>

      {cart.length === 0 ? (
        <div style={{
          textAlign: "center",
          border: "1px solid var(--border)",
          background: "rgba(17,17,17,0.4)",
          padding: "64px 32px",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🛒</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            color: "var(--text-secondary)",
            marginBottom: 24,
          }}>Your cart is empty.</div>
          <button onClick={() => { navigate("/"); setTimeout(() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }), 50); }} style={{
            padding: "12px 32px",
            background: "var(--red-primary)",
            border: "none",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}>Browse Products</button>
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid var(--border)", background: "rgba(17,17,17,0.4)", padding: "0 24px" }}>
            {cart.map(item => {
              const unitPrice = getItemPrice(item);
              const isBulk = item.qty >= 5;
              const tierLabel = item.qty >= 25 ? "25+ TIER" : item.qty >= 10 ? "10+ TIER" : item.qty >= 5 ? "5+ TIER" : null;
              return (
                <div key={item.id} style={rowStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      flexShrink: 0,
                      border: "1px solid var(--border)",
                      background: "#080808",
                      overflow: "hidden",
                    }}>
                      <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 4,
                    }}>{item.name} {item.dose}</div>
                    <div style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 15,
                      color: isBulk ? "var(--red-primary)" : "var(--text-secondary)",
                      fontWeight: isBulk ? 700 : 400,
                    }}>
                      ${unitPrice.toFixed(2)} /vial
                      {tierLabel && <span style={{ fontSize: 12, marginLeft: 8, color: "#22c55e", fontWeight: 700, letterSpacing: "0.05em" }}>{tierLabel}</span>}
                    </div>
                    {!isBulk && item.qty >= 3 && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}>Add {5 - item.qty} more for ${item.bulk}/vial</div>
                    )}
                    {item.qty >= 5 && item.qty < 10 && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}>Add {10 - item.qty} more for an extra 5% off</div>
                    )}
                    {item.qty >= 10 && item.qty < 25 && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}>Add {25 - item.qty} more for an extra 10% off</div>
                    )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, justifySelf: "center" }}>
                    {[[-1,"−"],[1,"+"]].map(([delta, label]) => (
                      <button key={delta} onClick={() => updateQty(item.id, delta)} style={{
                        width: 32, height: 32,
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 18,
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                        onMouseEnter={e => { e.target.style.borderColor = "var(--red-primary)"; e.target.style.color = "var(--red-primary)"; }}
                        onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
                      >{label}</button>
                    ))}
                    <span style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      minWidth: 24,
                      textAlign: "center",
                    }}>{item.qty}</span>
                  </div>

                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textAlign: "right",
                  }}>${(unitPrice * item.qty).toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          {/* Discount code section */}
          <div style={{
            padding: "24px 0 8px",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.15em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}>Discount Code</div>
            {[
              appliedDiscount && { applied: appliedDiscount, onRemove: removeDiscountCode },
              appliedShipping && { applied: appliedShipping, onRemove: removeShippingCode },
            ].filter(Boolean).map(({ applied, onRemove }) => (
              <div key={applied.code} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                border: "1px solid rgba(34,197,94,0.3)",
                background: "rgba(34,197,94,0.05)",
                marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#22c55e",
                    letterSpacing: "0.1em",
                  }}>{applied.code}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}>— {applied.label} applied</span>
                </div>
                <button
                  type="button"
                  onClick={onRemove}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    padding: "6px 12px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--red-primary)"; e.currentTarget.style.color = "var(--red-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >Remove</button>
              </div>
            ))}
            {(!appliedDiscount || !appliedShipping) && (
              <div style={{ marginBottom: 16, marginTop: (appliedDiscount || appliedShipping) ? 6 : 0 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={discountInput}
                    disabled={discountLoading}
                    onChange={e => { setDiscountInput(e.target.value); if (discountError) setDiscountError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyDiscountCode(); } }}
                    placeholder={appliedDiscount ? "Add a free-shipping code" : appliedShipping ? "Add a discount code" : "Enter code"}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      background: "rgba(17,17,17,0.8)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 15,
                      outline: "none",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      boxSizing: "border-box",
                      opacity: discountLoading ? 0.6 : 1,
                    }}
                  />
                  <button
                    type="button"
                    onClick={applyDiscountCode}
                    disabled={discountLoading}
                    style={{
                      padding: "0 22px",
                      background: "transparent",
                      border: "1px solid var(--red-primary)",
                      color: "var(--red-primary)",
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: discountLoading ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      opacity: discountLoading ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (!discountLoading) { e.currentTarget.style.background = "var(--red-primary)"; e.currentTarget.style.color = "#fff"; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--red-primary)"; }}
                  >{discountLoading ? "Checking…" : "Apply"}</button>
                </div>
                {discountError && (
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 13,
                    color: "var(--red-primary)",
                    marginTop: 8,
                  }}>{discountError}</div>
                )}
              </div>
            )}
          </div>

          <div style={{
            padding: "20px 0 8px",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              color: "var(--text-secondary)",
              paddingBottom: 8,
            }}>
              <span>Subtotal</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
            </div>
            {appliedDiscount && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 15,
                color: "#22c55e",
                paddingBottom: 8,
              }}>
                <span>Discount ({appliedDiscount.code})</span>
                <span style={{ fontWeight: 600 }}>−${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              color: "var(--text-secondary)",
              paddingBottom: 8,
            }}>
              <span>Shipping</span>
              <span style={{ color: shipping === 0 ? "#22c55e" : "var(--text-primary)", fontWeight: 600 }}>
                {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
              </span>
            </div>
            {shipping > 0 && subtotalAfterDiscount < 200 && (
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                color: "var(--text-dim)",
                fontStyle: "italic",
              }}>Add ${(200 - subtotalAfterDiscount).toFixed(2)} more for free shipping</div>
            )}
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 0 24px",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            marginBottom: 32,
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              letterSpacing: "0.1em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}>Total</span>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}>${total.toFixed(2)}</span>
          </div>

          <button onClick={() => setStep("info")} style={{
            width: "100%",
            padding: "16px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
            marginBottom: 16,
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >PROCEED TO CHECKOUT</button>

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 13,
            color: "var(--text-secondary)",
            textAlign: "center",
            opacity: 0.7,
          }}>All products sold for research use only. Not for human consumption.</div>
        </>
      )}
    </div>
  );
}

// ─── Lab Results Page ─────────────────────────────────────────────────────────

function LabResultsPage() {
  usePageMeta("Lab Results — Certificates of Analysis", "Third-party verified lab results and Certificates of Analysis for all Tier One BioSystems research peptides. 99%+ purity guaranteed.");
  const [searchParams] = useSearchParams();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);

  // Auto-expand product if navigated from a product page
  const productParam = searchParams.get("product");
  const doseParam = searchParams.get("dose");
  const autoKey = productParam && doseParam ? `${productParam} ${doseParam}` : productParam;
  const [expandedProduct, setExpandedProduct] = useState(
    autoKey && (LAB_RESULTS[autoKey] || LAB_RESULTS[productParam]) ? (LAB_RESULTS[autoKey] ? autoKey : productParam) : null
  );

  // Scroll to the expanded product on mount
  useEffect(() => {
    if (expandedProduct) {
      setTimeout(() => {
        const el = document.getElementById(`coa-${expandedProduct}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Get unique product names (no duplicate dose variants)
  // Build list of products with lab results — show each dose variant separately for multi-dose products
  const uniqueProducts = [];
  const seen = new Set();
  PRODUCTS.forEach(p => {
    const doseKey = `${p.name} ${p.dose}`;
    // If there's a dose-specific COA entry, show it separately
    if (LAB_RESULTS[doseKey] && !seen.has(doseKey)) {
      seen.add(doseKey);
      uniqueProducts.push({ ...p, coaKey: doseKey, displayName: `${p.name} — ${p.dose}` });
    } else if (!LAB_RESULTS[doseKey] && !seen.has(p.name) ) {
      seen.add(p.name);
      uniqueProducts.push({ ...p, coaKey: p.name, displayName: p.name });
    }
  });

  return (
    <div style={{ paddingTop: 100, paddingBottom: 80, maxWidth: 1100, margin: "0 auto", padding: "100px 24px 80px" }}>
      {/* Page header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>QUALITY ASSURANCE</div>
        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: isMobile ? 24 : 32,
          letterSpacing: "0.05em",
          marginBottom: 16,
        }}>CERTIFICATES OF ANALYSIS</h1>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--text-secondary)",
          maxWidth: 650,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>
          Every compound is independently tested and verified. Below are the analytical results
          for each product in our catalog, conducted by third-party laboratories.
        </p>
      </div>

      {/* Product COA list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {uniqueProducts.map(product => {
          const coa = LAB_RESULTS[product.coaKey];
          if (!coa) return null;
          const isExpanded = expandedProduct === product.coaKey;

          return (
            <div key={product.coaKey} id={`coa-${product.coaKey}`} style={{
              border: isExpanded ? "1px solid rgba(196,30,42,0.4)" : "1px solid var(--border)",
              background: "var(--bg-card)",
              transition: "all 0.3s ease",
            }}>
              {/* Clickable header row */}
              <div
                onClick={() => setExpandedProduct(isExpanded ? null : product.coaKey)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: isMobile ? "16px 16px" : "18px 28px",
                  cursor: "pointer",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: isMobile ? 14 : 16,
                    letterSpacing: "0.03em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>{product.displayName}</div>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 13,
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                    display: isMobile ? "none" : "block",
                  }}>Lot: {coa.lotNumber}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                  <span style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    padding: "4px 12px",
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e",
                  }}>ALL TESTS PASSED</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    transition: "transform 0.3s",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}>&#9660;</span>
                </div>
              </div>

              {/* Expanded COA details */}
              {isExpanded && (
                <div style={{
                  borderTop: "1px solid var(--border)",
                  padding: isMobile ? "20px 16px" : "28px 28px",
                  animation: "fadeIn 0.25s ease-out",
                }}>
                  {/* COA header info */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                    gap: 16,
                    marginBottom: 24,
                  }}>
                    {[
                      { label: "LOT NUMBER", value: coa.lotNumber },
                      { label: "DATE ANALYZED", value: coa.dateAnalyzed },
                      { label: "MOLECULAR WEIGHT", value: coa.molecularWeight },
                    ].map((item, i) => (
                      <div key={i} style={{
                        padding: "12px 16px",
                        border: "1px solid var(--border)",
                        background: "rgba(17,17,17,0.5)",
                      }}>
                        <div style={{
                          fontFamily: "'Orbitron', sans-serif",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          color: "var(--text-dim)",
                          marginBottom: 4,
                        }}>{item.label}</div>
                        <div style={{
                          fontFamily: "'Rajdhani', sans-serif",
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Results table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: isMobile ? 13 : 15,
                    }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid rgba(196,30,42,0.3)" }}>
                          {["Test", "Method", "Specification", "Result", "Status"].map(h => (
                            <th key={h} style={{
                              fontFamily: "'Orbitron', sans-serif",
                              fontSize: isMobile ? 9 : 10,
                              fontWeight: 700,
                              letterSpacing: "0.1em",
                              color: "var(--text-dim)",
                              textAlign: "left",
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {coa.tests.map((t, i) => (
                          <tr key={i} style={{
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                          }}>
                            <td style={{
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              whiteSpace: isMobile ? "normal" : "nowrap",
                            }}>{t.test}</td>
                            <td style={{
                              padding: "10px 12px",
                              color: "var(--text-secondary)",
                            }}>{t.method}</td>
                            <td style={{
                              padding: "10px 12px",
                              color: "var(--text-secondary)",
                            }}>{t.specification}</td>
                            <td style={{
                              padding: "10px 12px",
                              color: "var(--text-primary)",
                              fontWeight: 600,
                            }}>{t.result}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                fontFamily: "'Orbitron', sans-serif",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                padding: "3px 8px",
                                background: t.pass ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                                border: t.pass ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)",
                                color: t.pass ? "#22c55e" : "#ef4444",
                              }}>{t.pass ? "PASS" : "FAIL"}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* COA footer */}
                  <div style={{
                    marginTop: 20,
                    padding: "14px 18px",
                    border: "1px solid rgba(34,197,94,0.15)",
                    background: "rgba(34,197,94,0.03)",
                    display: "flex",
                    alignItems: isMobile ? "flex-start" : "center",
                    justifyContent: "space-between",
                    flexDirection: isMobile ? "column" : "row",
                    gap: 12,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#22c55e",
                        marginBottom: 4,
                      }}>OVERALL RESULT: PASS</div>
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 14,
                        color: "var(--text-secondary)",
                      }}>All specifications met. Product released for distribution.</div>
                    </div>
                    <div style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 13,
                      color: "var(--text-dim)",
                      whiteSpace: "nowrap",
                    }}>Analyzed: {coa.dateAnalyzed}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom disclaimer */}
      <div style={{
        marginTop: 48,
        padding: "18px 24px",
        border: "1px solid rgba(196,30,42,0.15)",
        background: "rgba(196,30,42,0.03)",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--red-primary)",
          marginBottom: 8,
        }}>THIRD-PARTY VERIFIED</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 15,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          maxWidth: 700,
          margin: "0 auto",
        }}>
          All analyses are performed by independent, accredited laboratories.
          Certificates of Analysis are available for every lot produced. Results shown reflect
          the most recent production lot for each compound.
        </div>
      </div>
    </div>
  );
}

// ─── Age Verification Gate ────────────────────────────────────────────────────

function NotFoundPage() {
  usePageMeta("Page Not Found", "The page you're looking for doesn't exist.");
  const navigate = useNavigate();
  return (
    <div style={{
      maxWidth: 600,
      margin: "0 auto",
      padding: "160px 24px 80px",
      textAlign: "center",
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 900,
        fontSize: 80,
        color: "var(--red-primary)",
        marginBottom: 16,
        opacity: 0.3,
      }}>404</div>
      <h1 style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 800,
        fontSize: 24,
        letterSpacing: "0.05em",
        marginBottom: 16,
      }}>PAGE NOT FOUND</h1>
      <p style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        color: "var(--text-secondary)",
        lineHeight: 1.7,
        marginBottom: 32,
      }}>The page you're looking for doesn't exist or has been moved.</p>
      <button onClick={() => navigate("/")} style={{
        padding: "14px 36px",
        background: "var(--red-primary)",
        border: "1px solid var(--red-primary)",
        color: "#fff",
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}>Back to Home</button>
    </div>
  );
}

// ─── Policy / Info Pages ─────────────────────────────────────────────────────

function PolicyShell({ title, kicker, children }) {
  return (
    <div style={{ maxWidth: 850, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>{kicker}</div>
        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 36px)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>{title}</h1>
      </div>
      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        lineHeight: 1.8,
        color: "var(--text-secondary)",
      }}>
        {children}
      </div>
    </div>
  );
}

const policyHeadingStyle = {
  fontFamily: "'Orbitron', sans-serif",
  fontWeight: 700,
  fontSize: 16,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  marginTop: 32,
  marginBottom: 12,
};

function ShippingPage() {
  usePageMeta("Shipping Policy", "How Tier One BioSystems ships research peptides — domestic shipping rates, processing time, free shipping over $200.");
  return (
    <>
      <PolicyShell kicker="POLICY" title="Shipping">
        <p>All orders are shipped from our facility in Phoenix, Arizona via UPS or FedEx in protective bubble mailers. Lyophilized research peptides are shelf-stable at room temperature for short transit periods, so cold-pack shipping is generally unnecessary for standard ground shipping windows.</p>

        <h2 style={policyHeadingStyle}>Shipping Rates</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>$10 flat rate</strong> on orders under $200. <strong style={{ color: "#22c55e" }}>FREE shipping</strong> on all orders $200 and over (after any discounts applied).</p>

        <h2 style={policyHeadingStyle}>Processing Time</h2>
        <p>Orders placed and paid before <strong style={{ color: "var(--text-primary)" }}>2:00 PM Arizona time</strong> ship the same business day. Orders placed after 2:00 PM, on weekends, or on US holidays ship the next business day. Payment must be received and confirmed before an order is processed.</p>

        <h2 style={policyHeadingStyle}>Delivery Time</h2>
        <p>Standard ground delivery within the continental US is typically 2–5 business days from ship date. You will receive a tracking number by email once your order ships.</p>

        <h2 style={policyHeadingStyle}>Domestic Only</h2>
        <p>We currently ship to the United States only. We do not ship internationally.</p>

        <h2 style={policyHeadingStyle}>Lost or Damaged Shipments</h2>
        <p>If your package arrives damaged or fails to arrive within 10 business days of shipment, contact us at <a href="mailto:sales@tierone.bio" style={{ color: "var(--red-primary)" }}>sales@tierone.bio</a> with your order number. We will work with the carrier to resolve the issue.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function ReturnsPage() {
  usePageMeta("Returns Policy", "Tier One BioSystems returns and refunds policy for research peptides.");
  return (
    <>
      <PolicyShell kicker="POLICY" title="Returns & Refunds">
        <p>Because every product we sell is a research-use-only laboratory compound, returns are accepted only in specific circumstances described below. By placing an order, you confirm that you are a qualified researcher purchasing for laboratory use only.</p>

        <h2 style={policyHeadingStyle}>Eligible Returns</h2>
        <p>We will replace or refund any product that:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li>Arrives damaged or with broken seals</li>
          <li>Was shipped incorrectly (wrong product, wrong dose)</li>
          <li>Fails to arrive within 10 business days of the ship date</li>
        </ul>

        <h2 style={policyHeadingStyle}>Non-Returnable Items</h2>
        <p>Once a product has been opened, reconstituted, used, or otherwise altered, it cannot be returned. Change-of-mind returns are not accepted on lyophilized research compounds due to chain-of-custody and lot-integrity requirements.</p>

        <h2 style={policyHeadingStyle}>How to Request a Return</h2>
        <p>Contact <a href="mailto:sales@tierone.bio" style={{ color: "var(--red-primary)" }}>sales@tierone.bio</a> within 7 days of delivery with your order number, a description of the issue, and photos if applicable. We will respond within 1 business day with next steps.</p>

        <h2 style={policyHeadingStyle}>Refund Method</h2>
        <p>Approved refunds are issued via the original payment method (Cash App or Venmo) within 3 business days of resolution.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function TermsPage() {
  usePageMeta("Terms of Service", "Terms of service for Tier One BioSystems research peptide supply.");
  return (
    <>
      <PolicyShell kicker="LEGAL" title="Terms of Service">
        <p>By accessing or purchasing from Tier One BioSystems, you agree to the following terms.</p>

        <h2 style={policyHeadingStyle}>Eligibility</h2>
        <p>You must be at least 18 years of age and a qualified researcher, laboratory professional, or scientific institution. Products are not for human or animal consumption and are sold solely for in-vitro laboratory research use.</p>

        <h2 style={policyHeadingStyle}>Product Use</h2>
        <p>All products are research-use-only (RUO) chemicals. They are not drugs, foods, cosmetics, or dietary supplements. They have not been evaluated by the FDA. They are not intended to diagnose, treat, cure, or prevent any disease in humans or animals.</p>

        <h2 style={policyHeadingStyle}>Customer Responsibility</h2>
        <p>You are solely responsible for handling, storing, and using research compounds in accordance with applicable federal, state, and local laws and accepted laboratory safety protocols. Tier One BioSystems is not responsible for any misuse, off-label use, or violation of applicable regulations by the purchaser.</p>

        <h2 style={policyHeadingStyle}>Pricing & Availability</h2>
        <p>Prices are subject to change without notice. Inventory is subject to availability. We reserve the right to refuse, cancel, or limit orders at our sole discretion.</p>

        <h2 style={policyHeadingStyle}>Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Tier One BioSystems' liability for any claim arising from the sale or use of our products is limited to the amount paid for the product in question.</p>

        <h2 style={policyHeadingStyle}>Governing Law</h2>
        <p>These terms are governed by the laws of the State of Arizona, USA.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function PrivacyPage() {
  usePageMeta("Privacy Policy", "How Tier One BioSystems collects and handles personal data.");
  return (
    <>
      <PolicyShell kicker="LEGAL" title="Privacy Policy">
        <p>Tier One BioSystems respects your privacy. This policy describes what information we collect and how we use it.</p>

        <h2 style={policyHeadingStyle}>Information We Collect</h2>
        <p>When you place an order, we collect the following information: name, email, phone number, shipping address, items ordered, and order total. This information is used solely to fulfill your order and communicate with you about it.</p>

        <h2 style={policyHeadingStyle}>How We Use Your Information</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>To process and ship your order</li>
          <li>To send order confirmations and shipping notifications</li>
          <li>To respond to support inquiries</li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2 style={policyHeadingStyle}>Information Sharing</h2>
        <p>We do not sell, trade, or rent your personal information to third parties. We share information only with service providers required to fulfill your order (shipping carriers, email service, payment platforms) and only the information necessary for that purpose.</p>

        <h2 style={policyHeadingStyle}>Cookies & Analytics</h2>
        <p>We use Google Analytics to understand site traffic. This service may set cookies. We use localStorage in your browser to remember your cart between visits. You can clear this at any time through your browser settings.</p>

        <h2 style={policyHeadingStyle}>Data Security</h2>
        <p>Order data is transmitted over HTTPS and stored on secure third-party services (Netlify Forms, EmailJS). Payments occur outside our site through Cash App or Venmo and we never see or store payment credentials.</p>

        <h2 style={policyHeadingStyle}>Contact</h2>
        <p>For privacy questions or data deletion requests, contact <a href="mailto:sales@tierone.bio" style={{ color: "var(--red-primary)" }}>sales@tierone.bio</a>.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function AboutPage() {
  usePageMeta("About", "Tier One BioSystems — research-grade peptides with lot-level transparency, 99%+ purity, and US-based fulfillment.");
  return (
    <>
      <PolicyShell kicker="WHO WE ARE" title="About Tier One">
        <p>Tier One BioSystems was built around a simple idea: research peptide buyers deserve total transparency. Every product we sell is documented at the lot level — purity, peptide content, mass confirmation, and sterility — so qualified researchers can make sourcing decisions with confidence.</p>

        <h2 style={policyHeadingStyle}>What We Do</h2>
        <p>We supply research-use-only peptides and compounds for laboratory use. Our catalog focuses on the most commonly studied compounds in academic and independent research settings, sourced from US and verified international synthesis partners.</p>

        <h2 style={policyHeadingStyle}>How We're Different</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong style={{ color: "var(--text-primary)" }}>Lot-level COAs.</strong> Every batch is tested by independent labs, and the results are published on this site before you order.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>99%+ purity standard.</strong> Released lots meet or exceed 99% purity by RP-HPLC.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>US-based fulfillment.</strong> Orders ship from Phoenix, Arizona — no overseas waiting.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Direct support.</strong> Questions go straight to a real person, not a ticket queue.</li>
        </ul>

        <h2 style={policyHeadingStyle}>Research Use Only</h2>
        <p>All products are sold for in-vitro laboratory research use only. They are not drugs, supplements, or food, and they are not intended for human or animal consumption. By purchasing, you acknowledge that you are a qualified researcher and accept responsibility for proper handling and use.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function FAQPage() {
  usePageMeta("FAQ", "Frequently asked questions about Tier One BioSystems research peptide products, ordering, shipping, and quality.");
  const [openIdx, setOpenIdx] = useState(null);
  const items = [
    { q: "Are your products for human use?", a: "No. All Tier One BioSystems products are sold strictly for in-vitro laboratory research use only. They are not drugs, supplements, food, or cosmetics. They are not intended for human or animal consumption." },
    { q: "What is your purity standard?", a: "Released lots meet or exceed 99% purity by reverse-phase HPLC. Each lot is tested for appearance, purity, peptide content, mass confirmation (ESI-MS or MALDI-TOF), water content, residual solvents, and bacterial endotoxins. Results are published on the Lab Results page." },
    { q: "How do I view a Certificate of Analysis (COA)?", a: "Every product page has a green VIEW CERTIFICATE OF ANALYSIS button. Clicking it opens that product's most recent lot data with all test results, methods, specifications, and pass/fail status." },
    { q: "How long does shipping take?", a: "Orders paid before 2:00 PM Arizona time ship the same business day from Phoenix, AZ via UPS or FedEx. Standard ground delivery within the continental US is typically 2–5 business days." },
    { q: "Do you offer free shipping?", a: "Yes. Orders of $200 or more (after any discounts applied) ship free. Orders under $200 are charged a flat $10 shipping fee." },
    { q: "What payment methods do you accept?", a: "Currently Cash App ($TierOneBio) and Venmo (@TierOneBio). At checkout you'll select your preferred method and follow the on-screen instructions to complete payment." },
    { q: "Why don't you accept credit cards?", a: "Most major card processors restrict research peptide sales due to category-level policy. Cash App and Venmo allow us to keep the catalog accessible and prices low without surprise account terminations or held funds." },
    { q: "How should I store the products?", a: "Lyophilized vials should be stored in a standard home freezer (0°F / -18°C) for long-term storage. Once reconstituted with bacteriostatic water, store refrigerated (35–46°F / 2–8°C) and use within the storage window listed on the product page." },
    { q: "Do you offer bulk discounts?", a: "Yes. Each product has a discounted per-vial price when you order 5 or more of the same compound and dose. The bulk price is shown on every product card and product page." },
    { q: "Do you ship internationally?", a: "Not at this time. We currently ship to the United States only." },
    { q: "What if my order arrives damaged?", a: "Contact us at sales@tierone.bio within 7 days of delivery with your order number and photos. We will replace or refund eligible damaged shipments." },
    { q: "How do I reach customer support?", a: "Email sales@tierone.bio or use the Contact form. Most replies arrive within one business day." },
  ];

  return (
    <>
      <div style={{ maxWidth: 850, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>HELP CENTER</div>
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(24px, 5vw, 36px)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}>Frequently Asked Questions</h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i} style={{
                border: isOpen ? "1px solid rgba(196,30,42,0.4)" : "1px solid var(--border)",
                background: "var(--bg-card)",
                transition: "all 0.3s ease",
              }}>
                <div onClick={() => setOpenIdx(isOpen ? null : i)} style={{
                  padding: "18px 24px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 600,
                    fontSize: 17,
                    color: "var(--text-primary)",
                  }}>{item.q}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s",
                    flexShrink: 0,
                  }}>&#9660;</span>
                </div>
                {isOpen && (
                  <div style={{
                    padding: "0 24px 22px",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 16,
                    color: "var(--text-secondary)",
                    lineHeight: 1.7,
                    animation: "fadeIn 0.25s ease-out",
                  }}>{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Footer />
    </>
  );
}

function TestingStandardsPage() {
  usePageMeta("Testing Standards", "How Tier One BioSystems verifies research peptide purity, identity, and safety. HPLC, ESI-MS, AAA, peptide content, and endotoxin testing explained.");
  return (
    <>
      <PolicyShell kicker="QUALITY ASSURANCE" title="Testing Standards">
        <p>Every lot Tier One BioSystems releases is independently tested against a defined acceptance specification. Below is what we test, why we test it, and the methods used. The current Certificate of Analysis for each product is published on the <a onClick={(e) => { e.preventDefault(); window.location.href = "/lab-results"; }} style={{ color: "var(--red-primary)", cursor: "pointer" }}>Lab Results</a> page.</p>

        <h2 style={policyHeadingStyle}>Appearance</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Visual.</strong> Lyophilized peptides are inspected for color, form, and visible particulates. Released lots are clean white-to-off-white powders unless otherwise noted (GHK-Cu, for example, is naturally blue).</p>

        <h2 style={policyHeadingStyle}>Purity (RP-HPLC)</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Reverse-phase High-Performance Liquid Chromatography.</strong> The gold-standard purity test for synthetic peptides. RP-HPLC separates a peptide from its synthesis byproducts and measures the proportion of target peptide. Tier One spec: <strong>≥ 99.0%</strong>.</p>

        <h2 style={policyHeadingStyle}>Mass Confirmation (ESI-MS / MALDI-TOF)</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Mass spectrometry.</strong> Confirms that the molecular weight of the synthesized peptide matches the theoretical molecular weight of the target sequence. This catches truncations, deletions, and modifications that purity alone might not flag.</p>

        <h2 style={policyHeadingStyle}>Amino Acid Analysis (AAA)</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Hydrolysis followed by quantitation.</strong> Verifies that the amino acid composition of the peptide matches the expected sequence. A second-line confirmation of identity.</p>

        <h2 style={policyHeadingStyle}>Peptide Content</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Nitrogen analysis.</strong> Measures how much of the lyophilized powder is actual peptide vs. trapped water, salts, and counter-ions. Tier One spec: <strong>≥ 80%</strong>. Higher peptide content means a more concentrated product per labeled mass.</p>

        <h2 style={policyHeadingStyle}>Labeled vs. Actual Peptide Content</h2>
        <p>We also publish the actual measured peptide content per vial alongside the labeled amount. Real-world lots are rarely exactly the labeled mass; we target slight overfill so researchers receive at least the labeled amount, never less.</p>

        <h2 style={policyHeadingStyle}>Water Content</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Karl Fischer titration.</strong> Excess water reduces stability and active peptide content. Tier One spec: <strong>≤ 8.0%</strong>.</p>

        <h2 style={policyHeadingStyle}>Bacterial Endotoxins</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Limulus Amebocyte Lysate (LAL).</strong> Detects bacterial-derived contaminants. Tier One spec: <strong>&lt; 5 EU/mg</strong> (well below USP injectable thresholds for human use, even though our products are not for human use).</p>

        <h2 style={policyHeadingStyle}>Residual Solvents</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Gas Chromatography Headspace (GC-HS).</strong> Confirms that residual synthesis solvents (TFA, acetonitrile, etc.) are within USP &lt;467&gt; limits.</p>

        <h2 style={policyHeadingStyle}>Acetate Content</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Ion Chromatography.</strong> Many peptides are isolated as acetate salts. We measure the acetate fraction so that peptide content calculations remain accurate. Spec: <strong>≤ 15.0%</strong>.</p>

        <h2 style={policyHeadingStyle}>Lot Release</h2>
        <p>A lot is released for sale only when every test in the specification passes. Lots that fail any criterion are rejected and never sold. The COA shown on the Lab Results page reflects the current released lot for each product.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function ResearchPage() {
  usePageMeta(
    "Research",
    "Peer-reviewed research summaries, peptide mechanism explainers, and educational articles from Tier One BioSystems — evidence-based content for qualified researchers."
  );
  const navigate = useNavigate();
  const isMobile = window.innerWidth < 700;
  const sorted = [...ARTICLES].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: "var(--red-primary)", marginBottom: 10 }}>RESEARCH</div>
          <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "clamp(24px, 5vw, 36px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>Peptide Research & Education</h1>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, color: "var(--text-secondary)", maxWidth: 680, margin: "0 auto", lineHeight: 1.7 }}>Evidence-based reviews of peptide mechanisms, research applications, and the peer-reviewed literature behind the compounds in our catalog.</p>
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'Rajdhani', sans-serif", color: "var(--text-dim)" }}>No articles yet. Check back soon.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {sorted.map(article => (
              <a key={article.slug} href={`/research/${article.slug}`} onClick={(e) => { e.preventDefault(); navigate(`/research/${article.slug}`); }} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <article style={{ border: "1px solid var(--border)", background: "var(--bg-card)", overflow: "hidden", transition: "all 0.2s", height: "100%", display: "flex", flexDirection: "column" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                  {article.heroImage && (
                    <div style={{ height: 180, background: "#080808", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img src={article.heroImage} alt={article.title} loading="lazy" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    </div>
                  )}
                  <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {(article.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", padding: "3px 8px", border: "1px solid rgba(196,30,42,0.3)", color: "var(--red-primary)", textTransform: "uppercase" }}>{tag}</span>
                      ))}
                    </div>
                    <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.02em", lineHeight: 1.25, marginBottom: 10, color: "var(--text-primary)" }}>{article.title}</h2>
                    <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 14, flex: 1 }}>{article.excerpt}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Rajdhani', sans-serif", fontSize: 12, color: "var(--text-dim)", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <span>{formatArticleDate(article.date)}</span>
                      <span>{article.readingTimeMinutes} min read</span>
                    </div>
                  </div>
                </article>
              </a>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

function ArticlePage() {
  const { slug } = useParams();
  const article = getArticleBySlug(slug);
  const navigate = useNavigate();
  usePageMeta(
    article ? (article.metaTitle || article.title) : "Article Not Found",
    article ? article.metaDescription : ""
  );
  useEffect(() => {
    if (!article) return;
    const DOMAIN = "https://www.tierone.bio";
    const jsonld = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": article.title,
      "description": article.metaDescription,
      "image": article.heroImage ? `${DOMAIN}${article.heroImage}` : undefined,
      "datePublished": article.date,
      "dateModified": article.date,
      "author": { "@type": "Organization", "name": article.author || "Tier One BioSystems" },
      "publisher": { "@type": "Organization", "name": "Tier One BioSystems", "logo": { "@type": "ImageObject", "url": `${DOMAIN}/logo_transparent.png` } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": `${DOMAIN}/research/${article.slug}` },
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-tier1-article", "true");
    script.textContent = JSON.stringify(jsonld);
    document.head.appendChild(script);
    return () => { document.querySelectorAll('script[data-tier1-article]').forEach(el => el.remove()); };
  }, [article]);
  if (!article) return <NotFoundPage />;
  const isMobile = window.innerWidth < 700;
  const related = (article.relatedProductIds || []).map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  return (
    <>
      <article style={{ maxWidth: 760, margin: "0 auto", padding: "110px 24px 80px" }}>
        <div style={{ marginBottom: 24, fontFamily: "'Rajdhani', sans-serif", fontSize: 13 }}>
          <a href="/research" onClick={(e) => { e.preventDefault(); navigate("/research"); }} style={{ color: "var(--red-primary)", textDecoration: "none" }}>← All research articles</a>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(article.tags || []).map(tag => (
            <span key={tag} style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", padding: "4px 10px", border: "1px solid rgba(196,30,42,0.3)", color: "var(--red-primary)", textTransform: "uppercase" }}>{tag}</span>
          ))}
        </div>

        <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "clamp(26px, 5vw, 38px)", letterSpacing: "0.02em", lineHeight: 1.15, marginBottom: 16, color: "var(--text-primary)" }}>{article.title}</h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
          <span>{article.author || "Tier One Research Team"}</span>
          <span>·</span>
          <span>{formatArticleDate(article.date)}</span>
          <span>·</span>
          <span>{article.readingTimeMinutes} min read</span>
        </div>

        {article.heroImage && (
          <div style={{ height: isMobile ? 240 : 320, background: "#080808", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 36, border: "1px solid var(--border)" }}>
            <img src={article.heroImage} alt={article.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 16 }} />
          </div>
        )}

        <div className="article-body" style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          {article.content()}
        </div>

        {article.references && article.references.length > 0 && (
          <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "var(--red-primary)", textTransform: "uppercase", marginBottom: 6 }}>Peer-reviewed research</div>
            <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.02em", color: "var(--text-primary)", marginBottom: 18 }}>References</h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {article.references.map((ref, i) => (
                <a key={i} href={ref.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "16px 18px", border: "1px solid var(--border)", background: "rgba(17,17,17,0.5)", textDecoration: "none", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"; e.currentTarget.style.background = "rgba(196,30,42,0.04)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(17,17,17,0.5)"; }}>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--red-primary)", marginBottom: 8, textTransform: "uppercase" }}>{ref.journal}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35, marginBottom: 8 }}>{ref.title}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginBottom: ref.authors ? 6 : 10 }}>{ref.year ? `${ref.year} · ` : ""}{ref.identifier}</div>
                  {ref.authors && <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)", marginBottom: 10 }}>{ref.authors}</div>}
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--red-primary)" }}>View Source ↗</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "var(--red-primary)", textTransform: "uppercase", marginBottom: 6 }}>From our catalog</div>
            <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.02em", color: "var(--text-primary)", marginBottom: 18 }}>Related Products</h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {related.map(p => (
                <a key={p.id} href={`/product/${p.id}`} onClick={(e) => { e.preventDefault(); navigate(`/product/${p.id}`); }} style={{ display: "block", textDecoration: "none", border: "1px solid var(--border)", background: "var(--bg-card)", padding: 16, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                  <div style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center", background: "#080808", marginBottom: 12 }}>
                    <img src={p.image} alt={p.name} loading="lazy" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 6 }} />
                  </div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{p.dose}</div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>${p.price}<span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500, fontSize: 13, color: "var(--text-dim)" }}> /vial</span></div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 48, padding: "20px 22px", border: "1px solid rgba(196,30,42,0.15)", background: "rgba(196,30,42,0.03)" }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: "var(--red-primary)", marginBottom: 6, textTransform: "uppercase" }}>Research Use Only</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>This content is for educational and research purposes. Tier One BioSystems products are sold for laboratory research use only. Not for human consumption. Not a drug, food, or cosmetic.</div>
        </div>
      </article>
      <Footer />
    </>
  );
}

function formatArticleDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function AgeGate({ onConfirm }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(0,0,0,0.95)",
      backdropFilter: "blur(20px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 520,
        width: "100%",
        background: "var(--bg-card)",
        border: "1px solid rgba(196,30,42,0.3)",
        padding: "48px 36px",
        textAlign: "center",
        animation: "fadeIn 0.4s ease-out",
      }}>
        {/* Logo */}
        <img
          src="/logo_transparent.png"
          alt="Tier One BioSystems"
          style={{
            height: 120,
            width: "auto",
            marginBottom: 28,
          }}
        />

        {/* Divider */}
        <div style={{
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(196,30,42,0.3), transparent)",
          marginBottom: 28,
        }} />

        {/* Age verification */}
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.05em",
          marginBottom: 16,
          color: "var(--text-primary)",
        }}>AGE VERIFICATION</h2>

        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          marginBottom: 28,
        }}>
          You must be <span style={{ color: "var(--red-primary)", fontWeight: 700 }}>18 years or older</span> to
          access this website.
        </p>

        {/* Disclaimer box */}
        <div style={{
          padding: "18px 20px",
          border: "1px solid rgba(196,30,42,0.15)",
          background: "rgba(196,30,42,0.03)",
          marginBottom: 32,
          textAlign: "left",
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--red-primary)",
            marginBottom: 8,
          }}>RESEARCH USE ONLY</div>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            margin: 0,
          }}>
            All products sold on this website are intended strictly for laboratory and
            research purposes only. They are not intended for human consumption and are
            not to be used as drugs, food, or cosmetics. By entering this site, you
            acknowledge that you are a qualified researcher or laboratory professional
            and agree to handle all products in accordance with applicable regulations
            and safety protocols.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => onConfirm(true)}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.15em",
              padding: "14px 36px",
              background: "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: "#fff",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              flex: 1,
              minWidth: 180,
            }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >I AM 18 OR OLDER</button>
          <button
            onClick={() => onConfirm(false)}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.15em",
              padding: "14px 36px",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              flex: 1,
              minWidth: 180,
            }}
          >I AM UNDER 18</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [ageVerified, setAgeVerified] = useState(() => {
    try { return sessionStorage.getItem("ageVerified") === "true"; }
    catch { return false; }
  });
  const [ageDenied, setAgeDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const navigate = useNavigate();
  const [cart, setCart] = useState(() => {
    try { const saved = localStorage.getItem("t1b-cart"); return saved ? JSON.parse(saved) : []; }
    catch { return []; }
  });
  useEffect(() => { localStorage.setItem("t1b-cart", JSON.stringify(cart)); }, [cart]);
  const [cartPopupVisible, setCartPopupVisible] = useState(false);
  const cartPopupTimer = useRef(null);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);
  useEffect(() => () => { if (cartPopupTimer.current) clearTimeout(cartPopupTimer.current); }, []);

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setCartPopupVisible(true);
    if (cartPopupTimer.current) clearTimeout(cartPopupTimer.current);
    cartPopupTimer.current = setTimeout(() => setCartPopupVisible(false), 4000);
  }

  useEffect(() => {
    const DOMAIN = "https://www.tierone.bio";
    const jsonld = {
      "@context": "https://schema.org",
      "@graph": PRODUCTS.map(p => ({
        "@type": "Product",
        "@id": `${DOMAIN}/product/${p.id}`,
        "name": `${p.name} ${p.dose}`,
        "description": p.research,
        "sku": p.id,
        "mpn": p.id,
        "brand": { "@type": "Brand", "name": "Tier One Bio" },
        "image": [`${DOMAIN}/${p.id}.jpg`, `${DOMAIN}/logo.png`],
        "url": `${DOMAIN}/product/${p.id}`,
        "offers": {
          "@type": "Offer",
          "url": `${DOMAIN}/product/${p.id}`,
          "price": p.price,
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "priceValidUntil": "2027-12-31",
          "seller": { "@type": "Organization", "name": "Tier One Bio" }
        }
      }))
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-tier1-products", "true");
    script.textContent = JSON.stringify(jsonld);
    document.head.appendChild(script);
    return () => {
      document.querySelectorAll('script[data-tier1-products]').forEach(el => el.remove());
    };
  }, []);

  const filtered = PRODUCTS.filter(p => {
    return searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Age denied screen
  if (ageDenied) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}>
        <div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 24,
            marginBottom: 16,
            color: "var(--red-primary)",
          }}>ACCESS DENIED</h2>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 17,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}>You must be 18 years or older to access this website.</p>
        </div>
      </div>
    );
  }

  // Age verification gate
  if (!ageVerified) {
    return (
      <AgeGate onConfirm={(isOldEnough) => {
        if (isOldEnough) {
          try { sessionStorage.setItem("ageVerified", "true"); } catch {}
          setAgeVerified(true);
        } else {
          setAgeDenied(true);
        }
      }} />
    );
  }

  // Home page content as a component
  // Featured product IDs
  const FEATURED_IDS = ["glp3rt-10", "tesamorelin", "bpc157-10", "tb500", "klow", "motsc"];
  const featuredProducts = FEATURED_IDS.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);

  const HomePage = () => {
    usePageMeta(null, "Premium research grade peptides with 99%+ purity. Third-party tested. BPC-157, GLP-3RT, Tesamorelin, and more. US-based supplier.");
    useScrollReveal();
    return (<>
      <Hero />

      {/* Featured Products */}
      <section className="scroll-reveal" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>BEST SELLERS</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: "0.05em",
          }}>FEATURED COMPOUNDS</h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 45%), 1fr))",
          gap: 20,
        }}>
          {featuredProducts.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onClick={() => setSelectedProduct(product)}
              onAddToCart={addToCart}
            />
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <button onClick={() => navigate("/products")} style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "16px 48px",
            background: "transparent",
            border: "1px solid var(--red-primary)",
            color: "var(--red-primary)",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
            onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
          >VIEW ALL PRODUCTS</button>
        </div>
      </section>

      <Footer />
    </>);
  };

  // Full Products Page
  const ProductsPage = () => {
    usePageMeta("All Products", "Browse our full catalog of research grade peptides. 99%+ purity, third-party tested.");
    useScrollReveal();
    return (<>
      <section style={{ maxWidth: 1400, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>CATALOG</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: "0.05em",
          }}>ALL RESEARCH COMPOUNDS</h2>
        </div>

        {/* Search bar */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 32,
        }}>
          <input
            type="text"
            placeholder="Search compounds..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              maxWidth: 400,
              padding: "10px 18px",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              outline: "none",
              letterSpacing: "0.05em",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(196,30,42,0.4)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>

        {/* Product grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 45%), 1fr))",
          gap: 20,
        }}>
          {filtered.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onClick={() => setSelectedProduct(product)}
              onAddToCart={addToCart}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 16,
            color: "var(--text-dim)",
          }}>No compounds found matching your search.</div>
        )}
      </section>
      <Footer />
    </>);
  };

  // Individual Product Page
  const ProductPage = () => {
    const { id } = useParams();
    const product = PRODUCTS.find(p => p.id === id);
    usePageMeta(
      product ? `${product.name} ${product.dose}` : "Product Not Found",
      product ? `${product.name} ${product.dose} — ${product.research?.slice(0, 150)}` : ""
    );
    const isMobile = window.innerWidth < 700;
    if (!product) return <NotFoundPage />;
    return (<>
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 0,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          marginBottom: 32,
        }}>
          {/* Image */}
          <div style={{
            background: "#080808",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            maxHeight: isMobile ? 300 : 450,
          }}>
            <img src={product.image} alt={product.name} loading="lazy" style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              padding: isMobile ? 10 : 20,
            }} />
          </div>

          {/* Info */}
          <div style={{ padding: isMobile ? "20px 18px" : "40px 36px", display: "flex", flexDirection: "column" }}>
            <h1 style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 800,
              fontSize: isMobile ? 24 : 32,
              letterSpacing: "0.03em",
              lineHeight: 1.1,
              marginBottom: 4,
            }}>{product.name}</h1>

            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 18,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 24,
            }}>{product.dose}</div>

            {/* Price block */}
            <div style={{
              padding: "16px 20px",
              border: "1px solid var(--border)",
              background: "rgba(196,30,42,0.03)",
              marginBottom: 24,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 28 }}>${product.price}</span>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--text-secondary)" }}>/vial</span>
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--red-primary)", fontWeight: 700 }}>5+ Vials: ${product.bulk} each</div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>10+ extra 5% off · 25+ extra 10% off</div>
            </div>

            <button onClick={() => addToCart(product)} style={{
              width: "100%",
              padding: "14px 0",
              background: "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: "#fff",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.2s",
              marginBottom: 20,
            }}
              onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
              onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
            >ADD TO CART</button>

            {/* Trust bar */}
            <div style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 20,
            }}>
              {[
                { label: "LOT-TESTED", color: "#22c55e" },
                { label: "SHIPS FROM US", color: "var(--red-primary)" },
                { label: "FREE OVER $200", color: "#22c55e" },
              ].map((b, i) => (
                <span key={i} style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "5px 10px",
                  border: `1px solid ${b.color === "#22c55e" ? "rgba(34,197,94,0.3)" : "rgba(196,30,42,0.4)"}`,
                  background: b.color === "#22c55e" ? "rgba(34,197,94,0.05)" : "rgba(196,30,42,0.05)",
                  color: b.color,
                }}>{b.label}</span>
              ))}
            </div>

            {/* Quick specs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "PURITY", value: product.purity },
                { label: "FORM", value: "Lyophilized" },
              ].map((spec, i) => (
                <div key={i} style={{ padding: "10px 14px", border: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", marginBottom: 4 }}>{spec.label}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{spec.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Research info */}
        <div style={{ border: "1px solid var(--border)", background: "var(--bg-card)", padding: isMobile ? "24px 18px" : "36px 40px", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: "var(--red-primary)", marginBottom: 16 }}>RESEARCH PROFILE</div>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, fontWeight: 400, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>{product.research}</p>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {[
              { label: "SEQUENCE / COMPOSITION", value: product.sequence },
              { label: "STORAGE CONDITIONS", value: product.storage },
            ].map((item, i) => (
              <div key={i} style={{ padding: "16px 20px", border: "1px solid var(--border)", background: "rgba(17,17,17,0.5)" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 500, color: "var(--text-secondary)", lineHeight: 1.6 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* View COA button */}
          {getLabResults(product.name, product.dose) && (
            <button onClick={() => navigate(`/lab-results?product=${encodeURIComponent(product.name)}&dose=${encodeURIComponent(product.dose)}`)} style={{
              marginTop: 28,
              width: "100%",
              padding: "12px 0",
              background: "transparent",
              border: "1px solid rgba(34,197,94,0.3)",
              color: "#22c55e",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.target.style.background = "rgba(34,197,94,0.1)"; }}
              onMouseLeave={e => { e.target.style.background = "transparent"; }}
            >VIEW CERTIFICATE OF ANALYSIS</button>
          )}
        </div>

        {/* Molecular Profile */}
        {getMolecularProfile(product.name) && (
          <div style={{ marginBottom: 24 }}>
            <MolecularProfile product={product} />
          </div>
        )}

        {/* Sources & References */}
        {getReferences(product.name) && (
          <div style={{
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            padding: isMobile ? "24px 18px" : "32px 36px",
            marginBottom: 24,
          }}>
            <SourcesReferences product={product} />
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ padding: "14px 18px", border: "1px solid rgba(196,30,42,0.15)", background: "rgba(196,30,42,0.03)" }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "var(--red-primary)", marginBottom: 6 }}>RESEARCH USE ONLY</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            This product is intended for laboratory research use only. Not for human consumption. Not a drug, food, or cosmetic. Handle with appropriate laboratory safety protocols.
          </div>
        </div>
      </section>
      <Footer />
    </>);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header cartCount={cart.reduce((sum, i) => sum + i.qty, 0)} />
      <CartPopup cart={cart} visible={cartPopupVisible} onClose={() => setCartPopupVisible(false)} />
      {selectedProduct && (
        <ProductQuickView
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
          onViewDetails={(product) => navigate(`/product/${product.id}`)}
        />
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/calculator" element={<PeptideCalculator />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/research/:slug" element={<ArticlePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/lab-results" element={<LabResultsPage />} />
        <Route path="/cart" element={<CartPage cart={cart} setCart={setCart} />} />
        <Route path="/checkout" element={<Navigate to="/cart" replace />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/testing-standards" element={<TestingStandardsPage />} />
        <Route path="/shipping" element={<ShippingPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
