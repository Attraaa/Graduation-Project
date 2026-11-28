import os
import tempfile
import unittest
from unittest.mock import patch

from keylog.raw_input import RawInputObserver, foreground_allowed
from keylog.service import RealtimeAttributionService

EDITOR = os.path.join(tempfile.gettempdir(), 'editor.exe')
BROWSER = os.path.join(tempfile.gettempdir(), 'browser.exe')


class DummyAnalyzer:
    def __init__(self, **_kwargs): self.frozen = False; self.finger_tracker = None
    def unfreeze_mapping(self): self.frozen = False


class FakeObserver:
    """Stands in for the Windows Raw Input window; records what the service asks of it."""
    instances = []

    def __init__(self, approved, on_press, on_status):
        self.approved, self.on_status = list(approved), on_status
        self.started = self.stopped = 0
        FakeObserver.instances.append(self)

    def set_approved(self, approved): self.approved = list(approved)
    def start(self): self.started += 1; self.on_status('excluded')
    def stop(self): self.stopped += 1


class ApprovedAppUpdateTests(unittest.TestCase):
    def service(self, approved=None):
        FakeObserver.instances = []
        patches = [patch('keylog.service.KeyboardPressAnalyzer', DummyAnalyzer),
                   patch('keylog.service.RawInputObserver', FakeObserver)]
        for item in patches:
            item.start(); self.addCleanup(item.stop)
        service = RealtimeAttributionService(token='page-token', control_token='main-token',
                                             use_mediapipe=False, approved_apps=approved)
        self.addCleanup(service.close)
        return service

    def post(self, service, apps, token='main-token'):
        return service.app.test_client().post('/api/approved-apps', json={'apps': apps},
                                              headers={'X-Moti-Control-Token': token} if token else {})

    def observe(self, service):
        client = service.socketio.test_client(service.app, auth={'token': 'page-token'})
        self.assertTrue(client.emit('start_observation', {'token': 'page-token'}, callback=True)['ok'])
        self.addCleanup(lambda: client.is_connected() and client.disconnect())
        return client

    def test_only_the_main_process_token_can_change_the_list(self):
        service = self.service()
        for token in [None, 'page-token', 'wrong']:
            self.assertEqual(self.post(service, [EDITOR], token).status_code, 401)
        self.assertIsNone(service.observer)
        without_control = RealtimeAttributionService(token='page-token', use_mediapipe=False)
        self.addCleanup(without_control.close)
        self.assertEqual(self.post(without_control, [EDITOR]).status_code, 401)

    def test_rejects_anything_but_a_short_list_of_absolute_exe_paths(self):
        service = self.service()
        for apps in [None, EDITOR, ['editor.exe'], [os.path.join(tempfile.gettempdir(), 'notes.txt')], [1], [EDITOR] * 33]:
            self.assertEqual(self.post(service, apps).status_code, 400, apps)

    def test_first_app_added_while_observing_starts_observation_at_once(self):
        service = self.service()
        client = self.observe(service)
        response = self.post(service, [BROWSER])
        self.assertEqual(response.get_json(), {'ok': True, 'status': 'excluded'})
        [observer] = FakeObserver.instances
        self.assertEqual((observer.approved, observer.started), ([BROWSER], 1))
        statuses = [e['args'][0]['status'] for e in client.get_received() if e['name'] == 'observation_status']
        self.assertEqual(statuses, ['excluded'])

    def test_changed_list_reaches_the_running_observer(self):
        service = self.service([EDITOR])
        self.observe(service)
        self.post(service, [EDITOR, BROWSER])
        [observer] = FakeObserver.instances
        self.assertEqual((observer.approved, observer.started, observer.stopped), ([EDITOR, BROWSER], 1, 0))

    def test_removing_every_app_stops_observation_and_reports_off(self):
        service = self.service([EDITOR])
        client = self.observe(service)
        client.get_received()
        self.assertEqual(self.post(service, []).get_json(), {'ok': True, 'status': 'off'})
        self.assertIsNone(service.observer)
        self.assertEqual(FakeObserver.instances[0].stopped, 1)
        self.assertIn({'status': 'off'}, [e['args'][0] for e in client.get_received() if e['name'] == 'observation_status'])

    def test_a_paused_page_does_not_start_an_app_added_meanwhile(self):
        service = self.service()
        client = self.observe(service)
        self.assertTrue(client.emit('stop_observation', {'token': 'page-token'}, callback=True)['ok'])
        self.post(service, [BROWSER])
        self.assertEqual(FakeObserver.instances[0].started, 0)


class ObserverListTests(unittest.TestCase):
    def test_set_approved_replaces_the_programs_that_match(self):
        observer = RawInputObserver([EDITOR], lambda *_: None)
        observer.set_approved([BROWSER])
        self.assertTrue(foreground_allowed(BROWSER, False, observer.approved))
        self.assertFalse(foreground_allowed(EDITOR, False, observer.approved))


if __name__ == '__main__':
    unittest.main()
