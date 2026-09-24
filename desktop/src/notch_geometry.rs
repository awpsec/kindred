// Auxiliary menu-bar areas can describe the camera cutout even when the safe
// inset is unavailable. Never treat that display as an unnotched 12px stem.
pub fn clearance(inset: f64, auxiliary_height: f64, auxiliary_gap: f64) -> (f64, f64) {
    let has_cutout = auxiliary_height.is_finite() && auxiliary_height > 0.
        && auxiliary_gap.is_finite() && auxiliary_gap > 0.;
    let inset = if inset.is_finite() { inset.max(0.) } else { 0. };
    let top = if has_cutout { inset.max(auxiliary_height) } else { inset };
    let bridge = if has_cutout { auxiliary_gap.max(100.) } else if top > 0. { 176. } else { 240. };
    (top, bridge)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn auxiliary_cutout_prevents_content_under_camera_when_inset_is_zero() {
        assert_eq!(clearance(0., 32., 176.), (32., 176.));
        assert_eq!(clearance(32., 37., 210.), (37., 210.));
        assert_eq!(clearance(48., 32., 176.), (48., 176.));
    }
    #[test]
    fn external_displays_and_missing_metrics_have_distinct_fallbacks() {
        assert_eq!(clearance(0., 0., 0.), (0., 240.));
        assert_eq!(clearance(32., 0., 0.), (32., 176.));
        assert_eq!(clearance(0., 32., 0.), (0., 240.));
        assert_eq!(clearance(f64::NAN, 32., 176.), (32., 176.));
    }
}
