#!/bin/bash
# Comprehensive audit of loading button pattern

echo "=== CHECKING ALL BUTTON HANDLERS ==="
echo ""

echo "1. Checking if all useState loading variables are in the phase reset useEffect:"
echo ""
grep -n "useState.*Loading" app/\[code\]/play/page.js | while read line; do
  varname=$(echo "$line" | sed 's/.*\[\(.*\)Loading.*/\1/')
  echo "  Found: ${varname}Loading"
  if grep -q "set${varname^}Loading(false)" app/\[code\]/play/page.js; then
    if grep -A5 "Reset loading states when phase changes" app/\[code\]/play/page.js | grep -q "set${varname^}Loading(false)"; then
      echo "    ✓ Found in reset useEffect"
    else
      echo "    ✗ MISSING from reset useEffect"
    fi
  fi
done

echo ""
echo "2. Checking all async handlers have loadState() after RPC:"
echo ""
for func in handleIWin handleNewLetters handleReady startGame join; do
  echo "  Checking $func..."
  if grep -A20 "async function $func" app/\[code\]/play/page.js app/\[code\]/page.js 2>/dev/null | grep -q "await loadState()"; then
    echo "    ✓ Has await loadState()"
  else
    echo "    ✗ MISSING await loadState()"
  fi
done

echo ""
echo "3. Checking all async handlers use try-catch:"
echo ""
for func in handleIWin handleNewLetters handleReady startGame join; do
  echo "  Checking $func..."
  if grep -A20 "async function $func" app/\[code\]/play/page.js app/\[code\]/page.js 2>/dev/null | grep -q "try {"; then
    echo "    ✓ Has try-catch"
  else
    echo "    ✗ MISSING try-catch"
  fi
done

echo ""
echo "4. Listing all setLoading(false) calls (should ONLY be in catch blocks or phase reset):"
echo ""
grep -n "set.*Loading(false)" app/\[code\]/play/page.js app/\[code\]/page.js | grep -v "useEffect"

