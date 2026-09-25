-- Laterality on complaints. "Wrist / hand pain" had no side, so a right wrist
-- injury read as a wrist injury everywhere a complaint was shown. The
-- joint-named pains and the limb-specific nerve symptoms now take a place like
-- a local finding does (the command bar asks "where?"; "Wrist / hand pain -
-- Right wrist" is what is saved, shown and printed). Midline complaints (neck,
-- back) stay side-less. Data only.
update public.observables set localizable = true
where label in (
    'Shoulder pain', 'Elbow pain', 'Wrist / hand pain', 'Hip pain', 'Knee pain', 'Ankle / foot pain',
    'Tingling / pins and needles', 'Numbness', 'Weak grip', 'Weakness in a limb'
);
