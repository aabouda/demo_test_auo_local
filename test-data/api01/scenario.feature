Feature: API Tests — Campagne 61

  @api_21151
  Scenario: POST /api/customers – valid payload with all fields
    Given api: /api/customers

  @api_21152
  Scenario: POST /api/customers – valid payload with required fields only
    Given api: /api/customers

  @api_21153
  Scenario: POST /api/customers – field 'nom' with wrong type (str instead of string)
    Given api: /api/customers

  @api_21154
  Scenario: POST /api/customers – field 'nom' is empty string
    Given api: /api/customers

  @api_21155
  Scenario: POST /api/customers – field 'nom' contains whitespace only
    Given api: /api/customers

  @api_21156
  Scenario: POST /api/customers – required field 'nom' missing
    Given api: /api/customers

  @api_21157
  Scenario: POST /api/customers – field 'nom' is null
    Given api: /api/customers

  @api_21158
  Scenario: POST /api/customers – field 'prenom' with wrong type (str instead of string)
    Given api: /api/customers

  @api_21159
  Scenario: POST /api/customers – field 'prenom' is empty string
    Given api: /api/customers

  @api_21160
  Scenario: POST /api/customers – field 'prenom' contains whitespace only
    Given api: /api/customers

  @api_21161
  Scenario: POST /api/customers – required field 'prenom' missing
    Given api: /api/customers

  @api_21162
  Scenario: POST /api/customers – field 'prenom' is null
    Given api: /api/customers

  @api_21163
  Scenario: POST /api/customers – field 'cin' with wrong type (str instead of string)
    Given api: /api/customers

  @api_21164
  Scenario: POST /api/customers – field 'cin' is empty string
    Given api: /api/customers

  @api_21165
  Scenario: POST /api/customers – field 'cin' contains whitespace only
    Given api: /api/customers

  @api_21166
  Scenario: POST /api/customers – required field 'cin' missing
    Given api: /api/customers

  @api_21167
  Scenario: POST /api/customers – field 'cin' is null
    Given api: /api/customers

  @api_21168
  Scenario: POST /api/customers – field 'email' with wrong type (str instead of string)
    Given api: /api/customers

  @api_21169
  Scenario: POST /api/customers – field 'email' is empty string
    Given api: /api/customers

  @api_21170
  Scenario: POST /api/customers – field 'email' contains whitespace only
    Given api: /api/customers

  @api_21171
  Scenario: POST /api/customers – required field 'email' missing
    Given api: /api/customers

  @api_21172
  Scenario: POST /api/customers – field 'email' is null
    Given api: /api/customers

  @api_21173
  Scenario: POST /api/customers – field 'email' has invalid format (email)
    Given api: /api/customers

  @api_21174
  Scenario: POST /api/customers – field 'phone' with wrong type (str instead of string)
    Given api: /api/customers

  @api_21175
  Scenario: POST /api/customers – field 'phone' is empty string
    Given api: /api/customers

  @api_21176
  Scenario: POST /api/customers – field 'phone' contains whitespace only
    Given api: /api/customers

  @api_21177
  Scenario: POST /api/customers – required field 'phone' missing
    Given api: /api/customers

  @api_21178
  Scenario: POST /api/customers – field 'phone' is null
    Given api: /api/customers

  @api_21179
  Scenario: POST /api/customers – field 'type' with wrong type (str instead of string)
    Given api: /api/customers

  @api_21180
  Scenario: POST /api/customers – field 'type' is empty string
    Given api: /api/customers

  @api_21181
  Scenario: POST /api/customers – field 'type' contains whitespace only
    Given api: /api/customers

  @api_21182
  Scenario: POST /api/customers – field 'type' is null
    Given api: /api/customers

  @api_21183
  Scenario: POST /api/customers – field 'type' has value outside allowed enum
    Given api: /api/customers

  @api_21184
  Scenario: POST /api/customers – multiple invalid fields: 'nom', 'prenom'
    Given api: /api/customers

  @api_21185
  Scenario: POST /api/customers – multiple invalid fields: 'nom', 'cin'
    Given api: /api/customers

  @api_21186
  Scenario: POST /api/customers – multiple invalid fields: 'nom', 'email'
    Given api: /api/customers

  @api_21187
  Scenario: POST /api/customers – valid payload with shuffled field order
    Given api: /api/customers

  @api_21188
  Scenario: Valid Request
    Given api: /api/customers

  @api_21189
  Scenario: Missing Required Field
    Given api: /api/customers

  @api_21190
  Scenario: Wrong Type Prename
    Given api: /api/customers

  @api_21191
  Scenario: Random Field Order
    Given api: Random Field Order

  @api_21192
  Scenario: Empty Array Validation
    Given api: /api/customers

  @api_21193
  Scenario: PUT /api/customers/{id} – valid payload with all fields
    Given api: /api/customers/VuseXv

  @api_21194
  Scenario: PUT /api/customers/{id} – field 'nom' with wrong type (str instead of string)
    Given api: /api/customers/VuseXv

  @api_21195
  Scenario: PUT /api/customers/{id} – field 'nom' is empty string
    Given api: /api/customers/VuseXv

  @api_21196
  Scenario: PUT /api/customers/{id} – field 'nom' contains whitespace only
    Given api: /api/customers/VuseXv

  @api_21197
  Scenario: PUT /api/customers/{id} – field 'nom' is null
    Given api: /api/customers/VuseXv

  @api_21198
  Scenario: PUT /api/customers/{id} – field 'prenom' with wrong type (str instead of string)
    Given api: /api/customers/VuseXv

  @api_21199
  Scenario: PUT /api/customers/{id} – field 'prenom' is empty string
    Given api: /api/customers/VuseXv

  @api_21200
  Scenario: PUT /api/customers/{id} – field 'prenom' contains whitespace only
    Given api: /api/customers/VuseXv

  @api_21201
  Scenario: PUT /api/customers/{id} – field 'prenom' is null
    Given api: /api/customers/VuseXv

  @api_21202
  Scenario: PUT /api/customers/{id} – field 'email' with wrong type (str instead of string)
    Given api: /api/customers/VuseXv

  @api_21203
  Scenario: PUT /api/customers/{id} – field 'email' is empty string
    Given api: /api/customers/VuseXv

  @api_21204
  Scenario: PUT /api/customers/{id} – field 'email' contains whitespace only
    Given api: /api/customers/VuseXv

  @api_21205
  Scenario: PUT /api/customers/{id} – field 'email' is null
    Given api: /api/customers/VuseXv

  @api_21206
  Scenario: PUT /api/customers/{id} – field 'email' has invalid format (email)
    Given api: /api/customers/VuseXv

  @api_21207
  Scenario: PUT /api/customers/{id} – field 'phone' with wrong type (str instead of string)
    Given api: /api/customers/VuseXv

  @api_21208
  Scenario: PUT /api/customers/{id} – field 'phone' is empty string
    Given api: /api/customers/VuseXv

  @api_21209
  Scenario: PUT /api/customers/{id} – field 'phone' contains whitespace only
    Given api: /api/customers/VuseXv

  @api_21210
  Scenario: PUT /api/customers/{id} – field 'phone' is null
    Given api: /api/customers/VuseXv

  @api_21211
  Scenario: PUT /api/customers/{id} – multiple invalid fields: 'nom', 'prenom'
    Given api: /api/customers/VuseXv

  @api_21212
  Scenario: PUT /api/customers/{id} – multiple invalid fields: 'nom', 'email'
    Given api: /api/customers/VuseXv

  @api_21213
  Scenario: PUT /api/customers/{id} – multiple invalid fields: 'nom', 'phone'
    Given api: /api/customers/VuseXv

  @api_21214
  Scenario: PUT /api/customers/{id} – valid payload with shuffled field order
    Given api: /api/customers/VuseXv

  @api_21215
  Scenario: Valid PUT Request
    Given api: /api/customers/{{Static.id}}

  @api_21216
  Scenario: Missing Required Field
    Given api: /api/customers/{{Static.id}}

  @api_21217
  Scenario: Invalid Type
    Given api: /api/customers/{{Static.id}}

  @api_21218
  Scenario: Empty Field
    Given api: /api/customers/{{Static.id}}

  @api_21219
  Scenario: JSON Structure Validation
    Given api: /api/customers/{{Static.id}}

  @api_21251
  Scenario: Valid deletion
    Given api: /api/customers/{{Static.id}}

  @api_21252
  Scenario: Missing path parameter
    Given api: /api/customers/{{Static.id}}

  @api_21253
  Scenario: Invalid ID format
    Given api: /api/customers/{{Static.id}}

  @api_21254
  Scenario: Response validation
    Given api: /api/customers/{{Static.id}}

  @api_21255
  Scenario: Valid GET Request
    Given api: /api/accounts/{{Static.id}}

  @api_21256
  Scenario: Missing Required Field
    Given api: /api/accounts/{{Static.id}}

  @api_21257
  Scenario: Response Structure Validation
    Given api: /api/accounts/{{Static.id}}

  @api_21220
  Scenario: POST /api/accounts – valid payload with all fields
    Given api: /api/accounts

  @api_21221
  Scenario: POST /api/accounts – valid payload with required fields only
    Given api: /api/accounts

  @api_21222
  Scenario: POST /api/accounts – field 'customerId' with wrong type (str instead of string)
    Given api: /api/accounts

  @api_21223
  Scenario: POST /api/accounts – field 'customerId' is empty string
    Given api: /api/accounts

  @api_21224
  Scenario: POST /api/accounts – field 'customerId' contains whitespace only
    Given api: /api/accounts

  @api_21225
  Scenario: POST /api/accounts – required field 'customerId' missing
    Given api: /api/accounts

  @api_21226
  Scenario: POST /api/accounts – field 'customerId' is null
    Given api: /api/accounts

  @api_21227
  Scenario: POST /api/accounts – field 'type' with wrong type (str instead of string)
    Given api: /api/accounts

  @api_21228
  Scenario: POST /api/accounts – field 'type' is empty string
    Given api: /api/accounts

  @api_21229
  Scenario: POST /api/accounts – field 'type' contains whitespace only
    Given api: /api/accounts

  @api_21230
  Scenario: POST /api/accounts – required field 'type' missing
    Given api: /api/accounts

  @api_21231
  Scenario: POST /api/accounts – field 'type' is null
    Given api: /api/accounts

  @api_21232
  Scenario: POST /api/accounts – field 'type' has value outside allowed enum
    Given api: /api/accounts

  @api_21233
  Scenario: POST /api/accounts – field 'initialDeposit' with wrong type (str instead of number)
    Given api: /api/accounts

  @api_21234
  Scenario: POST /api/accounts – field 'initialDeposit' is null
    Given api: /api/accounts

  @api_21235
  Scenario: POST /api/accounts – field 'initialDeposit' below minimum value
    Given api: /api/accounts

  @api_21236
  Scenario: POST /api/accounts – field 'currency' with wrong type (str instead of string)
    Given api: /api/accounts

  @api_21237
  Scenario: POST /api/accounts – field 'currency' is empty string
    Given api: /api/accounts

  @api_21238
  Scenario: POST /api/accounts – field 'currency' contains whitespace only
    Given api: /api/accounts

  @api_21239
  Scenario: POST /api/accounts – field 'currency' is null
    Given api: /api/accounts

  @api_21240
  Scenario: POST /api/accounts – field 'currency' has value outside allowed enum
    Given api: /api/accounts

  @api_21241
  Scenario: POST /api/accounts – multiple invalid fields: 'customerId', 'type'
    Given api: /api/accounts

  @api_21242
  Scenario: POST /api/accounts – multiple invalid fields: 'customerId', 'initialDeposit'
    Given api: /api/accounts

  @api_21243
  Scenario: POST /api/accounts – multiple invalid fields: 'customerId', 'currency'
    Given api: /api/accounts

  @api_21244
  Scenario: POST /api/accounts – valid payload with shuffled field order
    Given api: /api/accounts

  @api_21245
  Scenario: Valid Request
    Given api: /api/accounts

  @api_21246
  Scenario: Missing Initial Deposit
    Given api: /api/accounts

  @api_21247
  Scenario: Wrong Type Type
    Given api: /api/accounts

  @api_21248
  Scenario: Wrong Type Currency
    Given api: /api/accounts

  @api_21249
  Scenario: Random Field Order
    Given api: /api/accounts

  @api_21250
  Scenario: Empty Array Validation
    Given api: /api/accounts
