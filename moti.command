#!/bin/bash
"$(cd "$(dirname "$0")" && pwd)/scripts/moti.sh" "$@"
MOTI_EXIT=$?
if [ "$MOTI_EXIT" != 0 ]; then
    echo "Moti failed. See the error above."
fi
if [ "$MOTI_EXIT" != 0 ] || [ -z "${1:-}" ]; then
    read -r -p "Press Enter to close..." _
fi
exit $MOTI_EXIT
