import unittest
from release_notes import render

class ReleaseNotes(unittest.TestCase):
    def test_brief_notes_link_to_matching_public_releases(self):
        for kind in ('desktop', 'server'):
            body = render('1.2.3', '# Kindred 1.2.3\n\n- Smoother artifact loading.\n- Easier routine scheduling.', kind)
            self.assertIn('Smoother artifact loading.', body)
            self.assertIn('/v1.2.3', body)
            self.assertNotIn('kindred-desktop', body)
            self.assertLess(len(body.split()), 100)
    def test_rejects_wrong_version_or_long_internal_report(self):
        for notes in ('# Kindred 1.2.2\nFixes', '# Kindred 1.2.3\n' + 'detail ' * 201, '# Kindred 1.2.3\n'):
            with self.assertRaises(ValueError): render('1.2.3', notes, 'desktop')
