# Device-account onboarding acceptance

Run only against two isolated Local Cores and an isolated Server/PostgreSQL database.
Never point the fixtures at the installed production Core or a production database.
Each Core uses its own SQLite and discovery path; the Server uses `colab_device_test`.

```sh
python3 .trial/E2E-DEVICE-ONBOARDING-01/verify.py \
  --a /absolute/path/core-a/discovery.json \
  --b /absolute/path/core-b/discovery.json \
  --database postgres://USER@127.0.0.1:TEST_PORT/colab_device_test
```

The optional database argument seeds a second account binding solely for the Core
selection/unlink fixture. The persistence lifecycle test independently exercises real
cryptographic binding, replay/expiry, concurrent bootstrap and Google identity linking.
The script prints business assertions, never private keys, sessions or invitation tokens.

For two browser-based Core instances on one machine, use distinct hosts (`localhost`
and `127.0.0.1`) or separate browser profiles. HTTP cookies are host-scoped, not port-scoped;
two `localhost` ports in one profile overwrite each other's bootstrap cookie. Real users
on separate devices do not share that test-only cookie namespace.

Browser acceptance covered Home, Try → Session picker, dismissed-tip reload, invitation
prompt, recipient join → Session picker, cancel with an empty shared Session list, and
linked-device/standard confirmation. No personal Session was uploaded. Native Shell
deep links and clean-install distribution require a separate release acceptance.
