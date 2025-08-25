;; contracts/MSHTokenContract.clar
;; MSH Token Contract - Fungible Token for MediShareNet Rewards
;; Implements SIP-010 Fungible Token Trait with additional features for health data incentives
;; Features: Admin controls, multiple minters (e.g., reward pools), metadata per mint batch,
;;           pausing, burning, transfer restrictions, supply caps, and event emissions.

;; Traits
(use-trait ft-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-INVALID-RECIPIENT (err u103))
(define-constant ERR-INVALID-MINTER (err u104))
(define-constant ERR-ALREADY-REGISTERED (err u105))
(define-constant ERR-METADATA-TOO-LONG (err u106))
(define-constant ERR-TRANSFER-RESTRICTED (err u107))
(define-constant ERR-SUPPLY-CAP-EXCEEDED (err u108))
(define-constant ERR-NOT-ENOUGH-BALANCE (err u109))
(define-constant MAX-METADATA-LEN u500)
(define-constant MAX-SUPPLY u1000000000000) ;; 1 trillion tokens

;; Data Variables
(define-data-var token-name (string-ascii 32) "MediShareNet Token")
(define-data-var token-symbol (string-ascii 10) "MSH")
(define-data-var token-decimals uint u6)
(define-data-var total-supply uint u0)
(define-data-var contract-paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var mint-counter uint u0)

;; Data Maps
(define-map balances principal uint)
(define-map minters principal bool)
(define-map mint-records uint {amount: uint, recipient: principal, metadata: (string-utf8 500), timestamp: uint})
(define-map transfer-restrictions principal bool) ;; If true, user cannot transfer (e.g., locked for staking)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get admin)))

(define-private (is-minter (caller principal))
  (default-to false (map-get? minters caller)))

(define-private (can-transfer (sender principal))
  (not (default-to false (map-get? transfer-restrictions sender))))

(define-private (emit-mint-event (id uint) (amount uint) (recipient principal) (metadata (string-utf8 500)))
  (print {event: "mint", id: id, amount: amount, recipient: recipient, metadata: metadata, block-height: block-height}))

(define-private (emit-burn-event (amount uint) (owner principal))
  (print {event: "burn", amount: amount, owner: owner, block-height: block-height}))

(define-private (emit-transfer-event (amount uint) (sender principal) (recipient principal))
  (print {event: "transfer", amount: amount, sender: sender, recipient: recipient, block-height: block-height}))

;; Public Functions - SIP-010 Compliance
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (can-transfer sender) ERR-TRANSFER-RESTRICTED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq recipient CONTRACT-OWNER)) ERR-INVALID-RECIPIENT) ;; Prevent transfer to contract owner as sink
    (match (try! (ft-transfer? msh-token amount sender recipient))
      success (begin
        (emit-transfer-event amount sender recipient)
        (ok true))
      error ERR-NOT-ENOUGH-BALANCE)))

;; For SIP-010, but since it's our token, we implement directly
(define-public (get-name)
  (ok (var-get token-name)))

(define-public (get-symbol)
  (ok (var-get token-symbol)))

(define-public (get-decimals)
  (ok (var-get token-decimals)))

(define-public (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account))))

(define-public (get-total-supply)
  (ok (var-get total-supply)))

(define-public (get-token-uri)
  (ok (some "https://medisharenet.com/msh-token-metadata.json")))

;; Admin Functions
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin tx-sender) ERR-NOT-AUTHORIZED)
    (var-set admin new-admin)
    (ok true)))

(define-public (pause-contract)
  (begin
    (asserts! (is-admin tx-sender) ERR-NOT-AUTHORIZED)
    (var-set contract-paused true)
    (ok true)))

(define-public (unpause-contract)
  (begin
    (asserts! (is-admin tx-sender) ERR-NOT-AUTHORIZED)
    (var-set contract-paused false)
    (ok true)))

(define-public (add-minter (minter principal))
  (begin
    (asserts! (is-admin tx-sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? minters minter)) ERR-ALREADY-REGISTERED)
    (map-set minters minter true)
    (ok true)))

(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-admin tx-sender) ERR-NOT-AUTHORIZED)
    (map-set minters minter false)
    (ok true)))

;; Minting Function - Called by RewardPoolContract typically
(define-public (mint (amount uint) (recipient principal) (metadata (string-utf8 500)))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-minter tx-sender) ERR-INVALID-MINTER)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (<= (+ (var-get total-supply) amount) MAX-SUPPLY) ERR-SUPPLY-CAP-EXCEEDED)
    (asserts! (<= (len metadata) MAX-METADATA-LEN) ERR-METADATA-TOO-LONG)
    (let ((current-balance (default-to u0 (map-get? balances recipient))))
      (map-set balances recipient (+ current-balance amount))
      (var-set total-supply (+ (var-get total-supply) amount))
      (let ((id (+ (var-get mint-counter) u1)))
        (map-set mint-records id {amount: amount, recipient: recipient, metadata: metadata, timestamp: block-height})
        (var-set mint-counter id)
        (emit-mint-event id amount recipient metadata)
        (ok id)))))

;; Burning Function - For research access or penalties
(define-public (burn (amount uint))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (let ((current-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= current-balance amount) ERR-NOT-ENOUGH-BALANCE)
      (map-set balances tx-sender (- current-balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (emit-burn-event amount tx-sender)
      (ok true))))

;; Restriction Functions - For integration with Governance/Staking
(define-public (set-transfer-restriction (account principal) (restricted bool))
  (begin
    (asserts! (is-admin tx-sender) ERR-NOT-AUTHORIZED)
    (map-set transfer-restrictions account restricted)
    (ok true)))

;; Read-only Functions
(define-read-only (is-paused)
  (var-get contract-paused))

(define-read-only (get-mint-record (id uint))
  (map-get? mint-records id))

(define-read-only (get-minter-status (account principal))
  (default-to false (map-get? minters account)))

(define-read-only (get-transfer-restriction (account principal))
  (default-to false (map-get? transfer-restrictions account)))

;; Initialization - Mint initial supply if needed (e.g., for liquidity)
(begin
  ;; Example: Mint initial tokens to owner for bootstrapping
  (map-set balances CONTRACT-OWNER u1000000)
  (var-set total-supply u1000000)
)