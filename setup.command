#!/bin/bash
"$(cd "$(dirname "$0")" && pwd)/scripts/setup.sh" "$@"
MOTI_EXIT=$?
if [ "$MOTI_EXIT" != 0 ]; then
    echo "Moti setup failed. See the error above."
    read -r -p "Press Enter to close..." _
fi
exit $MOTI_EXIT
