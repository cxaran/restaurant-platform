// Generado automáticamente por scripts/generate-openapi.mjs. No editar manualmente.

export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_api_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness */
        get: operations["readiness_api_ready_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List My Addresses */
        get: operations["list_my_addresses_api_v1_users_me_addresses_get"];
        put?: never;
        /** Create My Address */
        post: operations["create_my_address_api_v1_users_me_addresses_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/addresses/{address_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete My Address */
        delete: operations["delete_my_address_api_v1_users_me_addresses__address_id__delete"];
        options?: never;
        head?: never;
        /** Update My Address */
        patch: operations["update_my_address_api_v1_users_me_addresses__address_id__patch"];
        trace?: never;
    };
    "/api/v1/audit-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Audit Events */
        get: operations["list_audit_events_api_v1_audit_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/audit-events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Audit Event */
        get: operations["get_audit_event_api_v1_audit_events__event_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Auth Policy
         * @description Política pública de auth. El frontend la consume; no infiere de settings.
         *
         *     El registro público es la política EFECTIVA: lo persistido en system_settings
         *     (editable por administradores) AND el candado del despliegue.
         */
        get: operations["read_auth_policy_api_v1_auth_policy_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Current User */
        get: operations["read_current_user_api_v1_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_v1_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify Login
         * @description Canjea el secreto del reto (código o token del enlace) por la sesión.
         *
         *     Exige la cookie del reto del MISMO navegador que inició el login: un enlace
         *     reenviado a otro dispositivo no crea sesión ahí. Consumo único y tope de
         *     intentos por reto; el error es genérico (no distingue causa).
         */
        post: operations["verify_login_api_v1_auth_login_verify_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/google/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Google Login Start
         * @description Arranca el OAuth con Google: 302 a la pantalla de consentimiento.
         *
         *     404 genérico con la función deshabilitada (no revela si existe la política);
         *     el state viaja hasheado en Redis con consumo único y TTL corto.
         */
        get: operations["google_login_start_api_v1_auth_google_start_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/google/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Google Login Callback
         * @description Aterrizaje del OAuth: valida state+nonce+id_token y resuelve la cuenta.
         *
         *     Éxito → cookie de sesión y 302 al inicio (SIN pasar por la verificación de
         *     login por correo: Google ya autenticó). Cualquier fallo → 302 a /login con
         *     un marcador genérico; la causa real queda sólo en los logs.
         */
        get: operations["google_login_callback_api_v1_auth_google_callback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Logout
         * @description Cierra la sesión actual borrando la cookie httponly.
         *
         *     Requiere sesión válida; no rota ``User.token`` (no es un cierre de sesión en
         *     todos los dispositivos, solo el actual).
         */
        post: operations["logout_api_v1_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request Registration */
        post: operations["request_registration_api_v1_auth_register_request_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Registration */
        post: operations["complete_registration_api_v1_auth_register_complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/unlock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Unlock Account */
        post: operations["unlock_account_api_v1_auth_unlock_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password/forgot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request Password Reset */
        post: operations["request_password_reset_api_v1_auth_password_forgot_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Password Reset */
        post: operations["complete_password_reset_api_v1_auth_password_reset_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Backup Settings */
        get: operations["list_backup_settings_api_v1_backup_settings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-settings/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Backup Settings Detail */
        get: operations["get_backup_settings_detail_api_v1_backup_settings__item_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Backup Settings
         * @description Edita la configuración. Reglas de fondo: zona IANA real, recipient de age
         *     UTILIZABLE (se valida invocando age), y ``enabled=true`` sólo con la
         *     configuración completa. Cambios de horario recalculan ``next_run_at``.
         */
        patch: operations["update_backup_settings_api_v1_backup_settings__item_id__patch"];
        trace?: never;
    };
    "/api/v1/backup-settings/{item_id}/generate-encryption-key": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Generate Encryption Key
         * @description Genera el par de claves age EN EL SISTEMA y activa el cifrado. La identidad
         *     privada viaja por CORREO al administrador (y queda guardada cifrada para
         *     reenviarse en cada cambio); la API nunca la devuelve.
         */
        post: operations["generate_encryption_key_api_v1_backup_settings__item_id__generate_encryption_key_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-settings/{item_id}/connect-drive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Connect Drive */
        post: operations["connect_drive_api_v1_backup_settings__item_id__connect_drive_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backups/google-drive/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Google Drive Callback
         * @description Callback OAuth de Google. Redirige a la pantalla de respaldos del frontend con
         *     un resultado NO sensible (?drive=connected|error).
         */
        get: operations["google_drive_callback_api_v1_backups_google_drive_callback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-settings/{item_id}/disconnect-drive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Disconnect Drive */
        post: operations["disconnect_drive_api_v1_backup_settings__item_id__disconnect_drive_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-settings/{item_id}/run-now": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Backup Now
         * @description Encola un respaldo manual y despierta el tick (si el broker no está arriba, el
         *     tick del siguiente minuto lo toma igual: la cola es la verdad).
         */
        post: operations["run_backup_now_api_v1_backup_settings__item_id__run_now_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Backup Runs */
        get: operations["list_backup_runs_api_v1_backup_runs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backup-runs/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Backup Run */
        get: operations["get_backup_run_api_v1_backup_runs__item_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backups/drive-files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Drive Backup Files
         * @description Archivos REALES de la carpeta de respaldos en la cuenta de Drive conectada
         *     (nombre, tipo, fecha y tamaño; más reciente primero).
         */
        get: operations["list_drive_backup_files_api_v1_backups_drive_files_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/backups/drive-files/{file_id}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download Drive Backup File
         * @description Descarga en STREAMING de un archivo de la carpeta de respaldos. Sólo sirve
         *     archivos que pertenezcan a la carpeta configurada (aunque el scope drive.file ya
         *     acota a archivos de la app, se valida la pertenencia explícitamente).
         */
        get: operations["download_drive_backup_file_api_v1_backups_drive_files__file_id__download_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bootstrap/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Bootstrap Status */
        get: operations["read_bootstrap_status_api_v1_bootstrap_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bootstrap/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Bootstrap Catalog */
        get: operations["read_bootstrap_catalog_api_v1_bootstrap_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bootstrap/initialize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Initialize Bootstrap */
        post: operations["initialize_bootstrap_api_v1_bootstrap_initialize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/business/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Profile */
        get: operations["read_profile_api_v1_business_profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Profile */
        patch: operations["update_profile_api_v1_business_profile_patch"];
        trace?: never;
    };
    "/api/v1/business/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Settings */
        get: operations["read_settings_api_v1_business_settings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Settings */
        patch: operations["update_settings_api_v1_business_settings_patch"];
        trace?: never;
    };
    "/api/v1/business/phones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Phones */
        get: operations["list_phones_api_v1_business_phones_get"];
        put?: never;
        /** Create Phone */
        post: operations["create_phone_api_v1_business_phones_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/business/phones/{phone_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Deactivate Phone */
        delete: operations["deactivate_phone_api_v1_business_phones__phone_id__delete"];
        options?: never;
        head?: never;
        /** Update Phone */
        patch: operations["update_phone_api_v1_business_phones__phone_id__patch"];
        trace?: never;
    };
    "/api/v1/business/weekly-hours": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Weekly Hours */
        get: operations["list_weekly_hours_api_v1_business_weekly_hours_get"];
        /** Replace Weekly Hours */
        put: operations["replace_weekly_hours_api_v1_business_weekly_hours_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/business/special-dates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Special Dates */
        get: operations["list_special_dates_api_v1_business_special_dates_get"];
        put?: never;
        /** Create Special Date */
        post: operations["create_special_date_api_v1_business_special_dates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/business/special-dates/{special_date_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Special Date */
        delete: operations["delete_special_date_api_v1_business_special_dates__special_date_id__delete"];
        options?: never;
        head?: never;
        /** Update Special Date */
        patch: operations["update_special_date_api_v1_business_special_dates__special_date_id__patch"];
        trace?: never;
    };
    "/api/v1/catalog/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Categories
         * @description Listado genérico (motor de query): filtros/búsqueda/orden del contrato.
         */
        get: operations["list_categories_api_v1_catalog_categories_get"];
        put?: never;
        /** Create Category */
        post: operations["create_category_api_v1_catalog_categories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/categories/{category_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Category */
        get: operations["get_category_api_v1_catalog_categories__category_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Category */
        patch: operations["update_category_api_v1_catalog_categories__category_id__patch"];
        trace?: never;
    };
    "/api/v1/catalog/categories/sort-order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Sort Categories */
        put: operations["sort_categories_api_v1_catalog_categories_sort_order_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Products
         * @description Listado genérico (motor de query). ``category_id`` sigue acotando por
         *     categoría; el estado se filtra con ``is_active`` (antes ``include_inactive``).
         *     Las imágenes/inclusiones del producto viven en el detalle, no en la lista.
         */
        get: operations["list_products_api_v1_catalog_products_get"];
        put?: never;
        /** Create Product */
        post: operations["create_product_api_v1_catalog_products_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Product */
        get: operations["get_product_api_v1_catalog_products__product_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Product */
        patch: operations["update_product_api_v1_catalog_products__product_id__patch"];
        trace?: never;
    };
    "/api/v1/catalog/categories/{category_id}/products/sort-order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Sort Products In Category */
        put: operations["sort_products_in_category_api_v1_catalog_categories__category_id__products_sort_order_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products/{product_id}/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Attach Product Image */
        post: operations["attach_product_image_api_v1_catalog_products__product_id__images_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products/{product_id}/images/{image_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Detach Product Image */
        delete: operations["detach_product_image_api_v1_catalog_products__product_id__images__image_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products/{product_id}/images/sort-order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Sort Product Images */
        put: operations["sort_product_images_api_v1_catalog_products__product_id__images_sort_order_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products/{product_id}/inclusions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Replace Product Inclusions */
        put: operations["replace_product_inclusions_api_v1_catalog_products__product_id__inclusions_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/modifier-groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Modifier Groups
         * @description Listado genérico (motor de query); las opciones del grupo viven en el detalle.
         */
        get: operations["list_modifier_groups_api_v1_catalog_modifier_groups_get"];
        put?: never;
        /** Create Modifier Group */
        post: operations["create_modifier_group_api_v1_catalog_modifier_groups_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/modifier-groups/{group_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Modifier Group */
        get: operations["get_modifier_group_api_v1_catalog_modifier_groups__group_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Modifier Group */
        patch: operations["update_modifier_group_api_v1_catalog_modifier_groups__group_id__patch"];
        trace?: never;
    };
    "/api/v1/catalog/modifier-groups/{group_id}/options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Modifier Option */
        post: operations["create_modifier_option_api_v1_catalog_modifier_groups__group_id__options_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/modifier-options/{option_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Modifier Option */
        patch: operations["update_modifier_option_api_v1_catalog_modifier_options__option_id__patch"];
        trace?: never;
    };
    "/api/v1/catalog/modifier-groups/{group_id}/options/sort-order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Sort Modifier Options */
        put: operations["sort_modifier_options_api_v1_catalog_modifier_groups__group_id__options_sort_order_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/products/{product_id}/modifier-groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Product Modifier Groups */
        get: operations["list_product_modifier_groups_api_v1_catalog_products__product_id__modifier_groups_get"];
        /** Replace Product Modifier Groups */
        put: operations["replace_product_modifier_groups_api_v1_catalog_products__product_id__modifier_groups_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/available-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Available Orders */
        get: operations["list_available_orders_api_v1_courier_available_orders_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/deliveries/mine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Active Deliveries
         * @description Entregas VIGENTES del propio repartidor (sobrevive recargas del panel).
         */
        get: operations["my_active_deliveries_api_v1_courier_deliveries_mine_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Set Availability */
        post: operations["set_availability_api_v1_courier_availability_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/deliveries/{order_delivery_id}/take": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Take */
        post: operations["take_api_v1_courier_deliveries__order_delivery_id__take_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/deliveries/{order_delivery_id}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start */
        post: operations["start_api_v1_courier_deliveries__order_delivery_id__start_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/deliveries/{order_delivery_id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Complete
         * @description Marca entregado: el repartidor DUEÑO del envío, o un empleado con
         *     ``deliveries:complete_for_courier`` en su nombre (§19.6).
         */
        post: operations["complete_api_v1_courier_deliveries__order_delivery_id__complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Summary */
        get: operations["my_summary_api_v1_courier_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/tracking": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Toggle Tracking */
        post: operations["toggle_tracking_api_v1_courier_tracking_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier/tracking/location": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Push Location */
        post: operations["push_location_api_v1_courier_tracking_location_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deliveries/{order_delivery_id}/assign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Assign Manual */
        post: operations["assign_manual_api_v1_deliveries__order_delivery_id__assign_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deliveries/queue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Deliveries Queue */
        get: operations["deliveries_queue_api_v1_deliveries_queue_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/credits/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Credits */
        get: operations["my_credits_api_v1_credits_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/credits/me/movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Movements */
        get: operations["my_movements_api_v1_credits_me_movements_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/credits/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** User Credits */
        get: operations["user_credits_api_v1_credits_users__user_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/credits/users/{user_id}/movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** User Movements */
        get: operations["user_movements_api_v1_credits_users__user_id__movements_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/credits/adjustments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Adjust Credits */
        post: operations["adjust_credits_api_v1_credits_adjustments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/discount-codes/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Quote Discount Code
         * @description Cotiza un código contra el carrito ACTUAL del cliente autenticado.
         *
         *     El backend valúa las líneas con ``price_cart``: el subtotal elegible es la
         *     suma monetaria de productos y modificadores — el envío NUNCA cuenta.
         */
        post: operations["quote_discount_code_api_v1_discount_codes_quote_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/discount-codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Discount Codes */
        get: operations["list_discount_codes_api_v1_discount_codes_get"];
        put?: never;
        /**
         * Create Discount Code
         * @description Crea un código. El texto es del administrador: NO hay generador automático.
         */
        post: operations["create_discount_code_api_v1_discount_codes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/discount-codes/{code_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Discount Code */
        get: operations["get_discount_code_api_v1_discount_codes__code_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Discount Code
         * @description Edita la definición VIGENTE del código. Todos los campos son editables.
         *
         *     Los cambios sólo afectan usos FUTUROS: las redenciones existentes conservan
         *     sus snapshots inmutables (código, nombre y montos del momento de reservar) y
         *     jamás se tocan al editar.
         */
        patch: operations["update_discount_code_api_v1_discount_codes__code_id__patch"];
        trace?: never;
    };
    "/api/v1/discount-codes/{code_id}/redemptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Discount Code Redemptions */
        get: operations["list_discount_code_redemptions_api_v1_discount_codes__code_id__redemptions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload File */
        post: operations["upload_file_api_v1_files_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/files/{file_id}/details": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get File Details */
        get: operations["get_file_details_api_v1_files__file_id__details_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/files/{file_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download File */
        get: operations["download_file_api_v1_files__file_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finances/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Categories
         * @description Listado genérico (motor de query): filtro por dirección/estado y búsqueda.
         */
        get: operations["list_categories_api_v1_finances_categories_get"];
        put?: never;
        /** Create Category */
        post: operations["create_category_api_v1_finances_categories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finances/categories/{category_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Finance Category */
        get: operations["get_finance_category_api_v1_finances_categories__category_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finances/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Entries */
        get: operations["list_entries_api_v1_finances_entries_get"];
        put?: never;
        /** Create Entry */
        post: operations["create_entry_api_v1_finances_entries_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finances/entries/{entry_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Void Financial Entry */
        post: operations["void_financial_entry_api_v1_finances_entries__entry_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finances/entries/{entry_id}/attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Attach Entry Evidence */
        post: operations["attach_entry_evidence_api_v1_finances_entries__entry_id__attachments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finances/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Summary */
        get: operations["read_summary_api_v1_finances_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/credit-refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refund Credit Line
         * @description Devolución de una línea 100% canjeada: pedidos SIN pago monetario.
         *
         *     No crea pagos ni reembolsos monetarios ficticios: la asignación vive sin
         *     ``payment_refund_id`` (dinero 0 por CHECK), con actor y motivo, y el ledger
         *     aplica sólo lo devolvible según el estado del canje (H2/H3).
         */
        post: operations["refund_credit_line_api_v1_orders__order_id__credit_refunds_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/{payment_id}/refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refund Payment */
        post: operations["refund_payment_api_v1_payments__payment_id__refunds_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Notifications */
        get: operations["my_notifications_api_v1_notifications_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/me/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Read All My Notifications */
        post: operations["read_all_my_notifications_api_v1_notifications_me_read_all_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/{notification_id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Read Notification */
        post: operations["read_notification_api_v1_notifications__notification_id__read_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/broadcast": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send Broadcast */
        post: operations["send_broadcast_api_v1_notifications_broadcast_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Orders
         * @description Tablero interno paginado: filtros por estado/canal/modo/pago/fechas/
         *     cliente y búsqueda por folio, cliente, quien recibe y dirección; cada fila
         *     trae aprobador, método de pago y envío (envelope estándar).
         */
        get: operations["list_orders_api_v1_orders_get"];
        put?: never;
        /** Checkout */
        post: operations["checkout_api_v1_orders_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/mine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List My Orders */
        get: operations["list_my_orders_api_v1_orders_mine_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/mine/{order_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get My Order */
        get: operations["get_my_order_api_v1_orders_mine__order_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/capture": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Capture Order */
        post: operations["capture_order_api_v1_orders_capture_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/status-counts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Order Status Counts
         * @description Conteo por estado con los MISMOS filtros del tablero (menos ``status``):
         *     alimenta los chips «Nuevos · 3» sin traerse los pedidos. Incluye
         *     ``customer_user_id`` para la ficha de cliente (§8.2).
         */
        get: operations["order_status_counts_api_v1_orders_status_counts_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/cancellations/pending-refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Cancelled Pending Refunds
         * @description Cola de conciliación H5: cancelados con cobro cuya devolución sigue abierta.
         *
         *     Incluye resoluciones refund_now/refund_pending mientras el dinero devuelto
         *     no cubra lo cobrado; «retain» queda fuera (decisión auditada aparte).
         */
        get: operations["list_cancelled_pending_refunds_api_v1_orders_cancellations_pending_refunds_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Order */
        get: operations["get_order_api_v1_orders__order_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/transition": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Transition */
        post: operations["transition_api_v1_orders__order_id__transition_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/shipping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Finalize Shipping */
        put: operations["finalize_shipping_api_v1_orders__order_id__shipping_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/adjustments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Adjustment */
        post: operations["add_adjustment_api_v1_orders__order_id__adjustments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/profiles/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Profile */
        get: operations["my_profile_api_v1_profiles_me_get"];
        /** Upsert My Profile */
        put: operations["upsert_my_profile_api_v1_profiles_me_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/profiles/customers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Customers */
        get: operations["search_customers_api_v1_profiles_customers_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/profiles/customers/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Customer Profile */
        get: operations["read_customer_profile_api_v1_profiles_customers__user_id__get"];
        /** Upsert Customer Profile */
        put: operations["upsert_customer_profile_api_v1_profiles_customers__user_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/profiles/staff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Staff Profiles */
        get: operations["list_staff_profiles_api_v1_profiles_staff_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/profiles/staff/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Upsert Staff Profile */
        put: operations["upsert_staff_profile_api_v1_profiles_staff__user_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/profiles/staff/me/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Set My Availability
         * @description El propio repartidor marca si está disponible AHORA (§19.5).
         */
        patch: operations["set_my_availability_api_v1_profiles_staff_me_availability_patch"];
        trace?: never;
    };
    "/api/v1/payment-methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Public Payment Methods
         * @description Métodos ACTIVOS disponibles en línea (público: el checkout los muestra).
         */
        get: operations["list_public_payment_methods_api_v1_payment_methods_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pos/payment-methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Pos Payment Methods
         * @description Métodos ACTIVOS disponibles en mostrador (1h: efectivo/terminal/transferencia).
         *
         *     El listado público filtra ``available_online`` y deja fuera los métodos
         *     exclusivos de mostrador (p. ej. efectivo en caja); el POS necesita los
         *     ``available_pos``.
         */
        get: operations["list_pos_payment_methods_api_v1_pos_payment_methods_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-method-configs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Payment Method Configs
         * @description Listado administrativo (motor de query): filtros y búsqueda por código/nombre.
         */
        get: operations["list_payment_method_configs_api_v1_payment_method_configs_get"];
        put?: never;
        /** Create Payment Method Config */
        post: operations["create_payment_method_config_api_v1_payment_method_configs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-method-configs/{method_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Payment Method Config */
        get: operations["get_payment_method_config_api_v1_payment_method_configs__method_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Payment Method Config
         * @description PATCH parcial. El ``code`` es inmutable y no existe DELETE: desactivar
         *     conserva los pagos históricos (FK RESTRICT sobre payments).
         */
        patch: operations["update_payment_method_config_api_v1_payment_method_configs__method_id__patch"];
        trace?: never;
    };
    "/api/v1/orders/{order_id}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Order Payments */
        get: operations["list_order_payments_api_v1_orders__order_id__payments_get"];
        put?: never;
        /** Record Order Payment */
        post: operations["record_order_payment_api_v1_orders__order_id__payments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/{payment_id}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify Payment */
        post: operations["verify_payment_api_v1_payments__payment_id__verify_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/{payment_id}/attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Attach Payment Evidence */
        post: operations["attach_payment_evidence_api_v1_payments__payment_id__attachments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Order Ticket */
        get: operations["get_order_ticket_api_v1_orders__order_id__ticket_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/ticket-prints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Ticket Prints
         * @description Bitácora de impresiones del pedido (§20): el frontend deriva de aquí el
         *     número de copia siguiente y la marca de REIMPRESIÓN.
         */
        get: operations["list_ticket_prints_api_v1_orders__order_id__ticket_prints_get"];
        put?: never;
        /** Log Ticket Print */
        post: operations["log_ticket_print_api_v1_orders__order_id__ticket_prints_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/pos/sales": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pos Sale
         * @description Venta presencial (§16 mostrador): submitted→approved→(pago)→completed.
         *
         *     La aprobación es implícita en la venta presencial; si el pago requiere
         *     verificación (transferencia/terminal), el pedido queda aprobado y el pago
         *     pendiente de verificar — no se marca completado hasta cobrar.
         */
        post: operations["pos_sale_api_v1_pos_sales_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Permissions */
        get: operations["list_permissions_api_v1_permissions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/business": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Public Business */
        get: operations["read_public_business_api_v1_public_business_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/legal/terms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Public Legal Terms
         * @description Datos para el documento legal autogenerado del sitio (/terminos).
         *
         *     Reúne la identidad del negocio, sus teléfonos públicos, los cupones
         *     GENERALES vigentes (para generar sus cláusulas) y las secciones opcionales
         *     que el administrador edita en el perfil. Los códigos personales nunca se
         *     exponen aquí.
         */
        get: operations["read_public_legal_terms_api_v1_public_legal_terms_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/menu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Public Menu
         * @description Menú público: catálogo REAL vigente (§58.3: se publica al instante).
         */
        get: operations["read_public_menu_api_v1_public_menu_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/shipping-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Quote Public Shipping
         * @description Cotización ESTIMADA de envío para el carrito (§17.2).
         *
         *     Sin ubicación → ``pending_review``: el pedido puede recibirse igual y el
         *     costo se valida manualmente. El costo final por pedido se decide en
         *     ``order_shipping`` al capturar/aprobar (etapa 4), nunca aquí.
         */
        post: operations["quote_public_shipping_api_v1_public_shipping_quote_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/files/{file_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Public File
         * @description Entrega pública de imágenes referidas por contenido público (menú, marca).
         *
         *     Sólo perfiles ``image``/``favicon``; cualquier otro tipo de archivo se
         *     comporta como inexistente. El binario es inmutable por id: cache largo.
         *     Acepta HEAD (FastAPI no lo deriva del GET): el frontend verifica así el
         *     content-type antes de referenciar el archivo como favicon/logo.
         */
        get: operations["read_public_file_api_v1_public_files__file_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        /**
         * Read Public File
         * @description Entrega pública de imágenes referidas por contenido público (menú, marca).
         *
         *     Sólo perfiles ``image``/``favicon``; cualquier otro tipo de archivo se
         *     comporta como inexistente. El binario es inmutable por id: cache largo.
         *     Acepta HEAD (FastAPI no lo deriva del GET): el frontend verifica así el
         *     content-type antes de referenciar el archivo como favicon/logo.
         */
        head: operations["read_public_file_api_v1_public_files__file_id__head"];
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/sales-by-hour": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sales By Hour */
        get: operations["sales_by_hour_api_v1_reports_sales_by_hour_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/top-products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Top Products */
        get: operations["top_products_api_v1_reports_top_products_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Resources
         * @description Catálogo de navegación completo, proyectado por permisos.
         *
         *     ``resources`` son los recursos tabulares/catálogo visibles (contrato CRUD
         *     genérico); ``navigation_modules`` son los módulos ESPECIALIZADOS (pantallas
         *     propias como el editor del sitio o el POS) donde el usuario tiene ALGUNO de
         *     los permisos declarados (*anyOf*).
         */
        get: operations["list_resources_api_v1_resources_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/{resource_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Resource Capability */
        get: operations["get_resource_capability_api_v1_resources__resource_name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Roles */
        get: operations["list_roles_api_v1_roles_get"];
        put?: never;
        /** Create Role */
        post: operations["create_role_api_v1_roles_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/roles/{role_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Role */
        get: operations["get_role_api_v1_roles__role_id__get"];
        put?: never;
        post?: never;
        /** Delete Role */
        delete: operations["delete_role_api_v1_roles__role_id__delete"];
        options?: never;
        head?: never;
        /** Update Role */
        patch: operations["update_role_api_v1_roles__role_id__patch"];
        trace?: never;
    };
    "/api/v1/roles/{role_id}/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Role Permissions
         * @description Selección actual de permisos del rol (lectura para el editor relacional).
         */
        get: operations["get_role_permissions_api_v1_roles__role_id__permissions_get"];
        /** Replace Role Permissions */
        put: operations["replace_role_permissions_api_v1_roles__role_id__permissions_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/shipping/zones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Zones
         * @description Listado genérico (motor de query) con campos simples; el polígono de
         *     cobertura y las tarifas viven en el detalle de la zona.
         */
        get: operations["list_zones_api_v1_shipping_zones_get"];
        put?: never;
        /** Create Zone */
        post: operations["create_zone_api_v1_shipping_zones_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/shipping/zones/{zone_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Zone */
        get: operations["get_zone_api_v1_shipping_zones__zone_id__get"];
        put?: never;
        post?: never;
        /**
         * Delete Zone
         * @description Elimina la zona DEFINITIVAMENTE (sus tarifas caen en cascada).
         *
         *     El historial de pedidos NO depende de la zona viva: cada pedido congela el
         *     monto cobrado y el nombre de la zona (snapshots en ``order_shipping``), y su
         *     referencia viva cae a NULL al borrar (FK ON DELETE SET NULL). La
         *     desactivación (PATCH ``is_active=false``) sigue disponible para pausar una
         *     zona sin destruirla.
         */
        delete: operations["delete_zone_api_v1_shipping_zones__zone_id__delete"];
        options?: never;
        head?: never;
        /** Update Zone */
        patch: operations["update_zone_api_v1_shipping_zones__zone_id__patch"];
        trace?: never;
    };
    "/api/v1/shipping/zones/{zone_id}/rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Rate */
        post: operations["create_rate_api_v1_shipping_zones__zone_id__rates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/shipping/rates/{rate_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Deactivate Rate */
        delete: operations["deactivate_rate_api_v1_shipping_rates__rate_id__delete"];
        options?: never;
        head?: never;
        /** Update Rate */
        patch: operations["update_rate_api_v1_shipping_rates__rate_id__patch"];
        trace?: never;
    };
    "/api/v1/storefront/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Config */
        get: operations["read_config_api_v1_storefront_config_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/storefront/heros": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Hero */
        post: operations["create_hero_api_v1_storefront_heros_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/storefront/heros/{hero_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Hero */
        put: operations["update_hero_api_v1_storefront_heros__hero_id__put"];
        post?: never;
        /** Delete Hero */
        delete: operations["delete_hero_api_v1_storefront_heros__hero_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/storefront/heros/sort": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sort Heros */
        post: operations["sort_heros_api_v1_storefront_heros_sort_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/storefront/highlights": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Highlight */
        post: operations["create_highlight_api_v1_storefront_highlights_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/storefront/highlights/{highlight_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Highlight */
        put: operations["update_highlight_api_v1_storefront_highlights__highlight_id__put"];
        post?: never;
        /** Delete Highlight */
        delete: operations["delete_highlight_api_v1_storefront_highlights__highlight_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/storefront/footer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Footer */
        patch: operations["update_footer_api_v1_storefront_footer_patch"];
        trace?: never;
    };
    "/api/v1/storefront/theme": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Theme */
        patch: operations["update_theme_api_v1_storefront_theme_patch"];
        trace?: never;
    };
    "/api/v1/storefront/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Site Settings */
        patch: operations["update_site_settings_api_v1_storefront_settings_patch"];
        trace?: never;
    };
    "/api/v1/public/storefront/site": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public Site */
        get: operations["public_site_api_v1_public_storefront_site_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/storefront/highlights": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Public Highlights */
        get: operations["public_highlights_api_v1_public_storefront_highlights_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/system-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List System Settings */
        get: operations["list_system_settings_api_v1_system_settings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/system-settings/setup-checklist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Setup Checklist
         * @description Checklist de puesta en marcha DERIVADO del estado real de la configuración.
         */
        get: operations["get_setup_checklist_api_v1_system_settings_setup_checklist_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/system-settings/setup-checklist/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dismiss Setup Checklist
         * @description Descarta el banner del checklist (el checklist sigue disponible a demanda).
         */
        post: operations["dismiss_setup_checklist_api_v1_system_settings_setup_checklist_dismiss_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/domain-challenge/{nonce}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Domain Challenge
         * @description Reto PÚBLICO de verificación de dominio: responde un HMAC del nonce con la
         *     clave de la instalación. El verificador (verify-domain) llama a este endpoint A
         *     TRAVÉS del dominio propuesto: si la respuesta coincide, ese dominio sirve ESTA
         *     instalación. Sin estado, sin auth, sin efectos.
         */
        get: operations["domain_challenge_api_v1_domain_challenge__nonce__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/system-settings/{item_id}/verify-domain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify Domain
         * @description Verifica y guarda el dominio base de la instalación.
         *
         *     Deriva el candidato del header Origin si no se envía; lo normaliza (solo
         *     esquema+host+puerto) y hace la prueba REAL: pedir el domain-challenge A TRAVÉS
         *     de ese dominio y comparar el HMAC. Si pasa, se persiste (app_base_url +
         *     verified_at), se AÑADE a los orígenes confiables en runtime (nunca reemplaza
         *     los del entorno) y habilita los redirect URIs derivados (p. ej. Google Drive).
         */
        post: operations["verify_domain_api_v1_system_settings__item_id__verify_domain_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/system-settings/{item_id}/send-test-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send Test Email
         * @description Verifica el transporte configurado enviando un correo real y PERSISTE el
         *     desenlace (email_last_test_*): el checklist marca el correo como verificado
         *     solo tras un test exitoso.
         */
        post: operations["send_test_email_api_v1_system_settings__item_id__send_test_email_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/system-settings/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get System Settings Detail */
        get: operations["get_system_settings_detail_api_v1_system_settings__item_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update System Settings */
        patch: operations["update_system_settings_api_v1_system_settings__item_id__patch"];
        trace?: never;
    };
    "/api/v1/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Profile */
        get: operations["read_profile_api_v1_users_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Profile */
        patch: operations["update_profile_api_v1_users_me_patch"];
        trace?: never;
    };
    "/api/v1/users/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change Password */
        post: operations["change_password_api_v1_users_me_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_v1_users_get"];
        put?: never;
        /** Create User */
        post: operations["create_user_api_v1_users_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get User */
        get: operations["get_user_api_v1_users__user_id__get"];
        put?: never;
        post?: never;
        /** Delete User */
        delete: operations["delete_user_api_v1_users__user_id__delete"];
        options?: never;
        head?: never;
        /** Update User */
        patch: operations["update_user_api_v1_users__user_id__patch"];
        trace?: never;
    };
    "/api/v1/users/{user_id}/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List User Roles */
        get: operations["list_user_roles_api_v1_users__user_id__roles_get"];
        /** Replace User Roles */
        put: operations["replace_user_roles_api_v1_users__user_id__roles_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{user_id}/revoke-sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke User Sessions */
        post: operations["revoke_user_sessions_api_v1_users__user_id__revoke_sessions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * ActionCondition
         * @description Condición de estado de una acción: conjunción (``all``) de predicados.
         *
         *     Sólo se soporta ``all`` (todos los predicados deben cumplirse). El permiso es una
         *     propiedad aparte (``permission`` en el registro) y nunca se expresa aquí. El backend
         *     sigue siendo la autoridad final: si el frontend no puede evaluar la condición, debe
         *     comportarse de forma conservadora.
         */
        ActionCondition: {
            /** All */
            all: components["schemas"]["ActionConditionPredicate"][];
        };
        /**
         * ActionConditionOperator
         * @description Operadores del DSL serializable de condiciones (``visible_when``/``enabled_when``).
         *
         *     Es un contrato de datos, no un lenguaje evaluable: nunca se publican expresiones,
         *     JavaScript, Python ni lambdas.
         * @enum {string}
         */
        ActionConditionOperator: "eq" | "neq" | "in" | "not_in" | "is_null" | "not_null";
        /**
         * ActionConditionPredicate
         * @description Predicado atómico: compara el campo ``field`` del item con ``value``.
         *
         *     ``value`` es escalar para ``eq``/``neq``, una lista para ``in``/``not_in`` y se
         *     omite para ``is_null``/``not_null``. La validez se comprueba al construir el
         *     predicado (en el registro de la acción), no al evaluarlo.
         */
        ActionConditionPredicate: {
            /** Field */
            field: string;
            operator: components["schemas"]["ActionConditionOperator"];
            /** Value */
            value?: unknown | null;
        };
        /** ActionConfirmation */
        ActionConfirmation: {
            /** Required */
            required: boolean;
            /** Title */
            title: string;
            /** Message */
            message: string;
            /** Confirm Label */
            confirm_label: string;
            /** Destructive */
            destructive: boolean;
        };
        /**
         * ActionInputSchema
         * @description Formulario declarado de entrada de una acción (B2).
         *
         *     Sólo se publica cuando la acción declara un ``input_schema`` (en vez de un cuerpo
         *     fijo). Reusa exactamente la misma proyección de formularios que ``create``/``update``:
         *     cada campo es un ``ResourceFormFieldCapability`` (label, tipo, widget, obligatoriedad
         *     y opciones). Nunca se serializan defaults, validadores ni la clase Python.
         */
        ActionInputSchema: {
            /** Fields */
            fields: components["schemas"]["ResourceFormFieldCapability"][];
        };
        /**
         * ActionRequestSpec
         * @description Cuerpo fijo declarado por backend para una acción.
         *
         *     El frontend envía exactamente ``fixed_body`` (o vacío si no hay request): no
         *     puede agregar, quitar ni modificar campos, ni reutilizar la acción para otro
         *     payload.
         */
        ActionRequestSpec: {
            /** Content Type */
            content_type: string;
            /** Fixed Body */
            fixed_body: {
                [key: string]: unknown;
            };
        };
        /**
         * ActionScope
         * @enum {string}
         */
        ActionScope: "item";
        /**
         * ActionSuccessBehavior
         * @enum {string}
         */
        ActionSuccessBehavior: "refresh";
        /** AssignCourierRequest */
        AssignCourierRequest: {
            /**
             * Courier User Id
             * Format: uuid
             */
            courier_user_id: string;
            /** Reason */
            reason?: string | null;
        };
        /** AssignmentRead */
        AssignmentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Delivery Id
             * Format: uuid
             */
            order_delivery_id: string;
            /**
             * Courier User Id
             * Format: uuid
             */
            courier_user_id: string;
            /** Courier Name Snapshot */
            courier_name_snapshot: string;
            /** Status */
            status: string;
            /** Is Current */
            is_current: boolean;
            /**
             * Assigned At
             * Format: date-time
             */
            assigned_at: string;
            /** Started At */
            started_at?: string | null;
            /** Completed At */
            completed_at?: string | null;
        };
        /**
         * AuditEventListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         *
         *     Sólo campos factuales de la bitácora. ``changed_fields`` no se proyecta en el
         *     listado (puede ser voluminoso y contener detalle sensible); se ve en el detalle.
         */
        AuditEventListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Fecha y hora
             * Format: date-time
             */
            occurred_at: string;
            /** Acción */
            action: string;
            /** Tipo de entidad */
            entity_type: string;
            /**
             * Entidad
             * Format: uuid
             */
            entity_id: string;
            /** Usuario */
            actor_user_id?: string | null;
            /** Motivo */
            reason?: string | null;
        };
        /**
         * AuditEventRead
         * @description Representación completa de un evento de auditoría (sólo lectura).
         */
        AuditEventRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Entity Type */
            entity_type: string;
            /**
             * Entity Id
             * Format: uuid
             */
            entity_id: string;
            /** Action */
            action: string;
            /** Actor User Id */
            actor_user_id?: string | null;
            /** Changed Fields */
            changed_fields?: {
                [key: string]: unknown;
            } | null;
            /** Reason */
            reason?: string | null;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
        };
        /**
         * AuthPolicyRead
         * @description Política pública de auth que el frontend consume (no infiere de settings).
         */
        AuthPolicyRead: {
            /** Registration Enabled */
            registration_enabled: boolean;
            /** Password Reset Enabled */
            password_reset_enabled: boolean;
            /**
             * Google Login Enabled
             * @default false
             */
            google_login_enabled: boolean;
        };
        /**
         * AvailableDeliveryItem
         * @description Elemento de la cola «listos para salir» (§19.5).
         *
         *     Incluye lo que el repartidor necesita para navegar y contactar SIN abrir
         *     el pedido completo: teléfono del destinatario, referencias y coordenadas
         *     (cuando el cliente/empleado fijó punto en mapa).
         */
        AvailableDeliveryItem: {
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /**
             * Order Delivery Id
             * Format: uuid
             */
            order_delivery_id: string;
            /** Public Code */
            public_code: string;
            /** Customer Name */
            customer_name?: string | null;
            /** Address Summary */
            address_summary: string;
            /** Zone Name */
            zone_name?: string | null;
            /** Collection Label */
            collection_label: string;
            /** Ready Since */
            ready_since?: string | null;
            /** Recipient Phone */
            recipient_phone?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Total Amount */
            total_amount?: string | null;
            /** Visible Notes */
            visible_notes?: string[];
        };
        /**
         * BackupDriveStatus
         * @description Estado de la conexión con Google Drive para respaldos.
         *
         *     ``needs_reauth`` detiene los reintentos: el token dejó de servir y sólo una
         *     reconexión del administrador lo resuelve. Enum NO nativo (VARCHAR + CHECK); el
         *     valor más largo es ``needs_reauth`` (12).
         * @enum {string}
         */
        BackupDriveStatus: "disconnected" | "active" | "needs_reauth";
        /**
         * BackupExplorerStatus
         * @description Estado del artefacto de EXPLORACIÓN (SQLite legible) de un respaldo.
         *
         *     Independiente del status principal: un respaldo restaurable correcto sigue
         *     ``succeeded`` aunque su explorer haya fallado. Enum NO nativo (VARCHAR + CHECK);
         *     el valor más largo es ``not_requested`` (13).
         * @enum {string}
         */
        BackupExplorerStatus: "not_requested" | "building" | "ready" | "failed";
        /**
         * BackupRunListItem
         * @description Versión de listado del historial de respaldos.
         */
        BackupRunListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Estado */
            status: components["schemas"]["BackupRunStatus"];
            /** Origen */
            trigger_kind: components["schemas"]["BackupTriggerKind"];
            /** Ventana */
            scheduled_for?: string | null;
            /** Inicio */
            started_at?: string | null;
            /** Fin */
            finished_at?: string | null;
            /** Archivo */
            file_name?: string | null;
            /** Tamaño (bytes) */
            file_size_bytes?: number | null;
            /** Retención */
            retention_roles: unknown[];
            /** Intentos */
            attempt_count: number;
            /** Error */
            error_code?: string | null;
            /** Explorador */
            explorer_status?: components["schemas"]["BackupExplorerStatus"] | null;
            /** Explorador (bytes) */
            explorer_file_size_bytes?: number | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * BackupRunRead
         * @description Detalle de una ejecución del historial (metadata operativa, nunca secretos).
         */
        BackupRunRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            status: components["schemas"]["BackupRunStatus"];
            trigger_kind: components["schemas"]["BackupTriggerKind"];
            /** Scheduled For */
            scheduled_for?: string | null;
            /** Next Attempt At */
            next_attempt_at?: string | null;
            /** Attempt Count */
            attempt_count: number;
            /** Started At */
            started_at?: string | null;
            /** Finished At */
            finished_at?: string | null;
            /** File Name */
            file_name?: string | null;
            /** File Size Bytes */
            file_size_bytes?: number | null;
            /** Ciphertext Sha256 */
            ciphertext_sha256?: string | null;
            /** Drive File Id */
            drive_file_id?: string | null;
            /** Drive Folder Id */
            drive_folder_id?: string | null;
            /** Encryption Fingerprint */
            encryption_fingerprint?: string | null;
            /** Retention Roles */
            retention_roles: unknown[];
            /** Error Code */
            error_code?: string | null;
            /** Error Summary */
            error_summary?: string | null;
            /** Pruned At */
            pruned_at?: string | null;
            explorer_status?: components["schemas"]["BackupExplorerStatus"] | null;
            /** Explorer File Size Bytes */
            explorer_file_size_bytes?: number | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * BackupRunStatus
         * @description Estado de una ejecución de respaldo (historial funcional).
         *
         *     Terminales: ``succeeded``, ``failed``, ``skipped`` y ``pruned`` (respaldo remoto
         *     rotado por retención; la fila se conserva). Enum NO nativo (VARCHAR + CHECK); el
         *     valor más largo es ``succeeded`` (9).
         * @enum {string}
         */
        BackupRunStatus: "queued" | "running" | "retrying" | "succeeded" | "failed" | "skipped" | "pruned";
        /**
         * BackupSettingsListItem
         * @description Versión de listado del singleton (una fila; la ALERTA persistente viaja aquí).
         */
        BackupSettingsListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Habilitado */
            enabled: boolean;
            /** Zona horaria */
            timezone: string;
            /**
             * Hora diaria
             * Format: time
             */
            daily_time: string;
            /** Google Drive */
            drive_status: components["schemas"]["BackupDriveStatus"];
            /** Próximo respaldo */
            next_run_at?: string | null;
            /** Último error */
            last_error_code?: string | null;
            /** Error registrado */
            last_error_at?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * BackupSettingsRead
         * @description Configuración completa (sin secretos: el token cifrado jamás se proyecta).
         */
        BackupSettingsRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Enabled */
            enabled: boolean;
            /** Timezone */
            timezone: string;
            /**
             * Daily Time
             * Format: time
             */
            daily_time: string;
            /** Next Run At */
            next_run_at?: string | null;
            /** Filename Prefix */
            filename_prefix: string;
            /** Retention Daily Count */
            retention_daily_count: number;
            /** Retention Monthly Count */
            retention_monthly_count: number;
            /** Retention Yearly Count */
            retention_yearly_count: number;
            /** Age Recipient */
            age_recipient?: string | null;
            /** Age Recipient Fingerprint */
            age_recipient_fingerprint?: string | null;
            /** Explorer Enabled */
            explorer_enabled: boolean;
            /** Google Drive Client Id */
            google_drive_client_id?: string | null;
            /** Google Drive Client Secret Configured */
            google_drive_client_secret_configured: boolean;
            /** Google Drive Redirect Uri */
            google_drive_redirect_uri?: string | null;
            drive_status: components["schemas"]["BackupDriveStatus"];
            /** Drive Folder Id */
            drive_folder_id?: string | null;
            /** Drive Connected At */
            drive_connected_at?: string | null;
            /** Last Error Code */
            last_error_code?: string | null;
            /** Last Error Summary */
            last_error_summary?: string | null;
            /** Last Error At */
            last_error_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
            /** Updated By */
            updated_by?: string | null;
        };
        /**
         * BackupSettingsUpdate
         * @description Actualización parcial de la configuración de respaldos (campos EDITABLES).
         *
         *     Las validaciones de fondo (zona IANA real, recipient de age utilizable, requisitos
         *     para ``enabled=true``) viven en el router/servicio; aquí van los rangos y formas.
         */
        BackupSettingsUpdate: {
            /**
             * Habilitado
             * @description Respaldo diario habilitado (requiere Drive conectado y cifrado configurado).
             */
            enabled?: boolean | null;
            /**
             * Zona horaria
             * @description Zona IANA en la que se interpreta la hora diaria (p. ej. America/Monterrey).
             */
            timezone?: string | null;
            /**
             * Hora diaria
             * @description Hora local del respaldo diario.
             */
            daily_time?: string | null;
            /**
             * Prefijo del archivo
             * @description 2-48 caracteres; letras, números, guion y guion bajo; inicia alfanumérico.
             */
            filename_prefix?: string | null;
            /** Copias diarias */
            retention_daily_count?: number | null;
            /** Copias mensuales */
            retention_monthly_count?: number | null;
            /** Copias anuales */
            retention_yearly_count?: number | null;
            /**
             * Artefacto de exploración
             * @description Genera el SQLite legible junto a cada respaldo (mismo snapshot).
             */
            explorer_enabled?: boolean | null;
            /**
             * Google Drive: client ID
             * @description Del cliente OAuth (tipo web) creado en Google Cloud.
             */
            google_drive_client_id?: string | null;
            /**
             * Google Drive: client secret (write-only)
             * @description Se guarda cifrado; nunca vuelve a mostrarse.
             */
            google_drive_client_secret?: string | null;
            /**
             * Recipient de age (clave pública, opcional)
             * @description OPCIONAL. Sin recipient el respaldo sube SIN cifrar (.tar); con la clave PÚBLICA age1… se cifra antes de subir (la privada nunca se sube).
             */
            age_recipient?: string | null;
        };
        /**
         * BackupTriggerKind
         * @description Origen de una ejecución de respaldo: programada o manual del administrador.
         * @enum {string}
         */
        BackupTriggerKind: "scheduled" | "manual";
        /** Body_upload_file_api_v1_files_post */
        Body_upload_file_api_v1_files_post: {
            /**
             * File
             * @description Archivo binario a almacenar.
             */
            file: string;
            /**
             * Kind
             * @description Perfil de validación: image, favicon o document.
             */
            kind: string;
        };
        /** BootstrapAdditionalRole */
        BootstrapAdditionalRole: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Permissions */
            permissions?: string[];
            /**
             * Assign To Initial User
             * @default false
             */
            assign_to_initial_user: boolean;
        };
        /** BootstrapCatalogRead */
        BootstrapCatalogRead: {
            /** Permission Groups */
            permission_groups: components["schemas"]["BootstrapPermissionGroupRead"][];
            limits: components["schemas"]["BootstrapLimitsRead"];
        };
        /** BootstrapInitialUser */
        BootstrapInitialUser: {
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /** BootstrapInitializeRead */
        BootstrapInitializeRead: {
            /** Setup Complete */
            setup_complete: boolean;
        };
        /** BootstrapInitializeRequest */
        BootstrapInitializeRequest: {
            user: components["schemas"]["BootstrapInitialUser"];
            system_admin_role?: components["schemas"]["BootstrapSystemAdminRole"];
            /** Additional Roles */
            additional_roles?: components["schemas"]["BootstrapAdditionalRole"][];
            /**
             * Public Registration Enabled
             * @description Permitir el auto-registro público desde el primer momento.
             * @default false
             */
            public_registration_enabled: boolean;
            /**
             * Password Reset Enabled
             * @description Permitir la recuperación de contraseña por correo.
             * @default true
             */
            password_reset_enabled: boolean;
            /**
             * Institution Name
             * @description Nombre de la institución (opcional).
             */
            institution_name?: string | null;
            /**
             * Customer Session Days
             * @description Días de sesión del cliente (sin roles). Vacío = default del despliegue. Editable después en Configuración del sistema.
             */
            customer_session_days?: number | null;
            /**
             * Staff Session Minutes
             * @description Minutos de sesión del personal (con roles). Vacío = default del despliegue. Editable después en Configuración del sistema.
             */
            staff_session_minutes?: number | null;
        };
        /** BootstrapLimitsRead */
        BootstrapLimitsRead: {
            /** Max Additional Roles */
            max_additional_roles: number;
        };
        /** BootstrapPermissionGroupRead */
        BootstrapPermissionGroupRead: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Permissions */
            permissions: components["schemas"]["BootstrapPermissionRead"][];
        };
        /** BootstrapPermissionRead */
        BootstrapPermissionRead: {
            /** Access */
            access: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
        };
        /** BootstrapStatusRead */
        BootstrapStatusRead: {
            /** Setup Required */
            setup_required: boolean;
            /** Token Required */
            token_required: boolean;
        };
        /** BootstrapSystemAdminRole */
        BootstrapSystemAdminRole: {
            /**
             * Label
             * @default Administrador de plataforma
             */
            label: string;
            /**
             * Description
             * @default Administración inicial de la plataforma
             */
            description: string | null;
        };
        /** BroadcastRequest */
        BroadcastRequest: {
            /** Title */
            title: string;
            /** Body */
            body: string;
            /**
             * Audience
             * @default all
             * @enum {string}
             */
            audience: "all" | "customers" | "staff";
        };
        /** BusinessPhoneCreate */
        BusinessPhoneCreate: {
            /** Label */
            label?: string | null;
            /** Phone */
            phone: string;
            /**
             * Is Whatsapp
             * @default false
             */
            is_whatsapp: boolean;
            /**
             * Is Public
             * @default true
             */
            is_public: boolean;
            /**
             * Is Primary
             * @default false
             */
            is_primary: boolean;
            /**
             * Sort Order
             * @default 0
             */
            sort_order: number;
        };
        /** BusinessPhoneRead */
        BusinessPhoneRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Label */
            label?: string | null;
            /** Phone */
            phone: string;
            /** Phone Normalized */
            phone_normalized: string;
            /** Is Whatsapp */
            is_whatsapp: boolean;
            /** Is Public */
            is_public: boolean;
            /** Is Primary */
            is_primary: boolean;
            /** Is Active */
            is_active: boolean;
            /** Sort Order */
            sort_order: number;
        };
        /** BusinessPhoneUpdate */
        BusinessPhoneUpdate: {
            /** Label */
            label?: string | null;
            /** Phone */
            phone?: string | null;
            /** Is Whatsapp */
            is_whatsapp?: boolean | null;
            /** Is Public */
            is_public?: boolean | null;
            /** Is Primary */
            is_primary?: boolean | null;
            /** Is Active */
            is_active?: boolean | null;
            /** Sort Order */
            sort_order?: number | null;
        };
        /** BusinessProfileRead */
        BusinessProfileRead: {
            /** Trade Name */
            trade_name: string;
            /** Legal Name */
            legal_name?: string | null;
            /** Slogan */
            slogan?: string | null;
            /** Email */
            email?: string | null;
            /** Main Address */
            main_address?: string | null;
            /** Terms Extra */
            terms_extra?: string | null;
            /** Privacy Extra */
            privacy_extra?: string | null;
            /** Currency Code */
            currency_code: string;
            /** Timezone */
            timezone: string;
            /** Order Prefix */
            order_prefix: string;
            /** Logo File Id */
            logo_file_id?: string | null;
            /** Is Accepting Orders */
            is_accepting_orders: boolean;
            /** Updated At */
            updated_at?: string | null;
        };
        /** BusinessProfileUpdate */
        BusinessProfileUpdate: {
            /** Trade Name */
            trade_name?: string | null;
            /** Legal Name */
            legal_name?: string | null;
            /** Slogan */
            slogan?: string | null;
            /** Email */
            email?: string | null;
            /** Main Address */
            main_address?: string | null;
            /** Terms Extra */
            terms_extra?: string | null;
            /** Privacy Extra */
            privacy_extra?: string | null;
            /** Currency Code */
            currency_code?: string | null;
            /** Timezone */
            timezone?: string | null;
            /** Order Prefix */
            order_prefix?: string | null;
            /** Logo File Id */
            logo_file_id?: string | null;
            /** Is Accepting Orders */
            is_accepting_orders?: boolean | null;
        };
        /** BusinessSettingsRead */
        BusinessSettingsRead: {
            /** Allow Online Orders */
            allow_online_orders: boolean;
            /** Allow Delivery */
            allow_delivery: boolean;
            /** Allow Pickup */
            allow_pickup: boolean;
            /** Allow Counter Sales */
            allow_counter_sales: boolean;
            /** Allow Customer Registration */
            allow_customer_registration: boolean;
            /** Require Registered User For Checkout */
            require_registered_user_for_checkout: boolean;
            /** Order Approval Required */
            order_approval_required: boolean;
            /** Online Orders Require Open Hours */
            online_orders_require_open_hours: boolean;
            /** Minimum Delivery Order Amount */
            minimum_delivery_order_amount?: string | null;
            /** Free Shipping Global From Amount */
            free_shipping_global_from_amount?: string | null;
            /** Ticket Footer Text */
            ticket_footer_text?: string | null;
            /** Updated At */
            updated_at?: string | null;
        };
        /** BusinessSettingsUpdate */
        BusinessSettingsUpdate: {
            /** Allow Online Orders */
            allow_online_orders?: boolean | null;
            /** Allow Delivery */
            allow_delivery?: boolean | null;
            /** Allow Pickup */
            allow_pickup?: boolean | null;
            /** Allow Counter Sales */
            allow_counter_sales?: boolean | null;
            /** Allow Customer Registration */
            allow_customer_registration?: boolean | null;
            /** Require Registered User For Checkout */
            require_registered_user_for_checkout?: boolean | null;
            /** Order Approval Required */
            order_approval_required?: boolean | null;
            /** Online Orders Require Open Hours */
            online_orders_require_open_hours?: boolean | null;
            /** Minimum Delivery Order Amount */
            minimum_delivery_order_amount?: number | string | null;
            /** Free Shipping Global From Amount */
            free_shipping_global_from_amount?: number | string | null;
            /** Ticket Footer Text */
            ticket_footer_text?: string | null;
        };
        /**
         * BusinessSummaryRead
         * @description Fórmula del periodo (§21.1): ingresos − gastos − reembolsos.
         */
        BusinessSummaryRead: {
            /** Income Total */
            income_total: string;
            /** Expense Total */
            expense_total: string;
            /** Refund Total */
            refund_total: string;
            /** Net Result */
            net_result: string;
            /** Entry Count */
            entry_count: number;
        };
        /**
         * CancelledWithPaymentItem
         * @description Cola de conciliación H5: cancelados con cobro y devolución abierta.
         */
        CancelledWithPaymentItem: {
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /** Public Code */
            public_code: string;
            /** Cancelled At */
            cancelled_at?: string | null;
            /** Cancellation Money Resolution */
            cancellation_money_resolution?: string | null;
            /** Cancellation Resolution Note */
            cancellation_resolution_note?: string | null;
            /** Paid Total */
            paid_total: string;
            /** Refunded Total */
            refunded_total: string;
            /** Outstanding Amount */
            outstanding_amount: string;
        };
        /**
         * CaptureRequest
         * @description Captura por personal (§1.2): cliente OPCIONAL; el empleado queda registrado.
         */
        CaptureRequest: {
            /**
             * Source
             * @enum {string}
             */
            source: "counter" | "phone" | "whatsapp" | "social" | "manual";
            /**
             * Fulfillment Type
             * @enum {string}
             */
            fulfillment_type: "delivery" | "pickup" | "counter";
            /**
             * Purchase Mode
             * @default money
             * @enum {string}
             */
            purchase_mode: "money" | "credits";
            /** Lines */
            lines: components["schemas"]["OrderLineInput"][];
            /** Customer User Id */
            customer_user_id?: string | null;
            /** Customer Name */
            customer_name?: string | null;
            /** Customer Phone */
            customer_phone?: string | null;
            /** Customer Email */
            customer_email?: string | null;
            /** Customer Note */
            customer_note?: string | null;
            /** Internal Note */
            internal_note?: string | null;
            delivery?: components["schemas"]["DeliveryInput"] | null;
        };
        /** CategoryCreate */
        CategoryCreate: {
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
        };
        /**
         * CategoryListItem
         * @description Fila del listado administrativo genérico de categorías (shell contract-driven).
         */
        CategoryListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Orden */
            sort_order: number;
            /** Activa */
            is_active: boolean;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
        };
        /** CategoryRead */
        CategoryRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Sort Order */
            sort_order: number;
            /** Is Active */
            is_active: boolean;
        };
        /** CategoryUpdate */
        CategoryUpdate: {
            /** Nombre */
            name?: string | null;
            /** Descripción */
            description?: string | null;
            /** Activa */
            is_active?: boolean | null;
        };
        /**
         * CheckoutRequest
         * @description Checkout del sitio (source=online): SIEMPRE usuario registrado (§1.2).
         */
        CheckoutRequest: {
            /**
             * Fulfillment Type
             * @enum {string}
             */
            fulfillment_type: "delivery" | "pickup";
            /**
             * Purchase Mode
             * @default money
             * @enum {string}
             */
            purchase_mode: "money" | "credits";
            /** Lines */
            lines: components["schemas"]["OrderLineInput"][];
            /** Customer Name */
            customer_name: string;
            /** Customer Phone */
            customer_phone: string;
            /** Customer Note */
            customer_note?: string | null;
            delivery?: components["schemas"]["DeliveryInput"] | null;
            /** Discount Code */
            discount_code?: string | null;
        };
        /** CompleteDeliveryRequest */
        CompleteDeliveryRequest: {
            /** Delivered To Name */
            delivered_to_name?: string | null;
            /** Completion Note */
            completion_note?: string | null;
            /** Proof File Id */
            proof_file_id?: string | null;
        };
        /**
         * ConnectDriveResponse
         * @description Respuesta de la acción conectar Drive: URL de autorización de Google.
         */
        ConnectDriveResponse: {
            /** Authorization Url */
            authorization_url: string;
        };
        /**
         * CourierSummaryRead
         * @description Resumen DERIVADO del día del repartidor (§19.7): sin cajas ni cortes.
         *
         *     Incluye la disponibilidad vigente para que el panel arranque sincronizado
         *     con el servidor (no con estado local).
         */
        CourierSummaryRead: {
            /** Deliveries Completed */
            deliveries_completed: number;
            /** Cash Collected */
            cash_collected: string;
            /** Shipping Charged */
            shipping_charged: string;
            /**
             * Is Delivery Available
             * @default false
             */
            is_delivery_available: boolean;
        };
        /** CreditAdjustmentCreate */
        CreditAdjustmentCreate: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /**
             * Delta
             * @description Positivo suma, negativo resta; nunca deja saldo negativo.
             */
            delta: number;
            /** Description */
            description: string;
        };
        /** CreditMovementRead */
        CreditMovementRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Entry Type */
            entry_type: string;
            /** Credit Delta */
            credit_delta: number;
            /** Description */
            description?: string | null;
            /** Order Id */
            order_id?: string | null;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
        };
        /** CreditRefundAllocationRead */
        CreditRefundAllocationRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Line Id
             * Format: uuid
             */
            order_line_id: string;
            /** Refunded Quantity */
            refunded_quantity: number;
            /** Credits Refunded Total */
            credits_refunded_total: number;
            /** Credits Earned Reversed Total */
            credits_earned_reversed_total: number;
            /** Reason */
            reason?: string | null;
            /** Processed By */
            processed_by?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * CreditRefundCreate
         * @description Devolución de línea 100% canjeada (pedido sin pago monetario).
         */
        CreditRefundCreate: {
            /**
             * Order Line Id
             * Format: uuid
             */
            order_line_id: string;
            /** Refunded Quantity */
            refunded_quantity: number;
            /** Reason */
            reason: string;
        };
        /**
         * CreditTotalsRead
         * @description Tarjeta de créditos (§58.3): tres agregaciones del ledger.
         */
        CreditTotalsRead: {
            /** Available */
            available: number;
            /** Earned */
            earned: number;
            /** Redeemed */
            redeemed: number;
        };
        /** Cta */
        Cta: {
            /** Label */
            label: string;
            /**
             * Link Type
             * @enum {string}
             */
            link_type: "internal_route" | "anchor" | "product" | "category" | "credits_page" | "menu_page" | "whatsapp" | "phone" | "external_https";
            /** Target */
            target?: string | null;
        };
        /** CustomerProfileRead */
        CustomerProfileRead: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /** Full Name */
            full_name: string;
            /** Phone */
            phone: string;
            /** Phone Normalized */
            phone_normalized: string;
            /** Email */
            email?: string | null;
            /** Internal Notes */
            internal_notes?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * CustomerProfileSelfRead
         * @description Vista del propio cliente: sin notas internas (§8.2).
         */
        CustomerProfileSelfRead: {
            /** Full Name */
            full_name: string;
            /** Phone */
            phone: string;
            /** Email */
            email?: string | null;
        };
        /**
         * CustomerProfileSelfUpsert
         * @description El cliente edita lo suyo; jamás las notas internas.
         */
        CustomerProfileSelfUpsert: {
            /** Full Name */
            full_name: string;
            /** Phone */
            phone: string;
            /** Email */
            email?: string | null;
        };
        /** CustomerProfileUpsert */
        CustomerProfileUpsert: {
            /** Full Name */
            full_name: string;
            /** Phone */
            phone: string;
            /** Email */
            email?: string | null;
            /** Internal Notes */
            internal_notes?: string | null;
        };
        /**
         * DeliveryInput
         * @description Dirección de entrega: guardada (propia) o capturada manualmente.
         */
        DeliveryInput: {
            /** User Address Id */
            user_address_id?: string | null;
            /** Recipient Name */
            recipient_name?: string | null;
            /** Recipient Phone */
            recipient_phone?: string | null;
            /** Street */
            street?: string | null;
            /** External Number */
            external_number?: string | null;
            /** Internal Number */
            internal_number?: string | null;
            /** Neighborhood */
            neighborhood?: string | null;
            /** City */
            city?: string | null;
            /** Postal Code */
            postal_code?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Delivery Note */
            delivery_note?: string | null;
        };
        /** DeliveryZoneCreate */
        DeliveryZoneCreate: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Coverage */
            coverage: {
                [key: string]: unknown;
            };
            /**
             * Priority
             * @default 0
             */
            priority: number;
        };
        /**
         * DeliveryZoneListItem
         * @description Fila del listado administrativo genérico de zonas.
         *
         *     Sin ``coverage`` ni ``rates``: el polígono y las tarifas se administran en la
         *     pantalla especializada de envíos.
         */
        DeliveryZoneListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Código */
            code: string;
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Prioridad */
            priority: number;
            /** Activa */
            is_active: boolean;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
        };
        /** DeliveryZoneRead */
        DeliveryZoneRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Coverage */
            coverage: {
                [key: string]: unknown;
            };
            /** Priority */
            priority: number;
            /** Is Active */
            is_active: boolean;
            /** Rates */
            rates?: components["schemas"]["ShippingRateRead"][];
        };
        /** DeliveryZoneUpdate */
        DeliveryZoneUpdate: {
            /** Código */
            code?: string | null;
            /** Nombre */
            name?: string | null;
            /** Descripción */
            description?: string | null;
            /** Coverage */
            coverage?: {
                [key: string]: unknown;
            } | null;
            /** Prioridad */
            priority?: number | null;
            /** Activa */
            is_active?: boolean | null;
        };
        /** DiscountCodeCreate */
        DiscountCodeCreate: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Code */
            code: string;
            /** Discount Amount */
            discount_amount: number | string;
            /** Minimum Order Amount */
            minimum_order_amount: number | string;
            /** Valid From */
            valid_from?: string | null;
            /** Valid Until */
            valid_until?: string | null;
            /** Target Customer User Id */
            target_customer_user_id?: string | null;
            /**
             * Is Active
             * @default true
             */
            is_active: boolean;
        };
        /** DiscountCodeListItem */
        DiscountCodeListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Code */
            code: string;
            /** Discount Amount */
            discount_amount: string;
            /** Minimum Order Amount */
            minimum_order_amount: string;
            /** Valid From */
            valid_from?: string | null;
            /** Valid Until */
            valid_until?: string | null;
            /** Target Customer User Id */
            target_customer_user_id?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** DiscountCodeRead */
        DiscountCodeRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Code */
            code: string;
            /** Discount Amount */
            discount_amount: string;
            /** Minimum Order Amount */
            minimum_order_amount: string;
            /** Valid From */
            valid_from?: string | null;
            /** Valid Until */
            valid_until?: string | null;
            /** Target Customer User Id */
            target_customer_user_id?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** DiscountCodeUpdate */
        DiscountCodeUpdate: {
            /** Name */
            name?: string | null;
            /** Description */
            description?: string | null;
            /** Code */
            code?: string | null;
            /** Discount Amount */
            discount_amount?: number | string | null;
            /** Minimum Order Amount */
            minimum_order_amount?: number | string | null;
            /** Valid From */
            valid_from?: string | null;
            /** Valid Until */
            valid_until?: string | null;
            /** Target Customer User Id */
            target_customer_user_id?: string | null;
            /** Is Active */
            is_active?: boolean | null;
        };
        /**
         * DiscountQuoteRequest
         * @description Cotización del carrito web: sólo el código y las líneas (IDs+cantidades).
         */
        DiscountQuoteRequest: {
            /** Discount Code */
            discount_code: string;
            /** Lines */
            lines: components["schemas"]["OrderLineInput"][];
        };
        /** DiscountQuoteResult */
        DiscountQuoteResult: {
            /** Valid */
            valid: boolean;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Discount Amount */
            discount_amount: string;
            /** Minimum Order Amount */
            minimum_order_amount: string;
            /** Eligible Subtotal */
            eligible_subtotal: string;
        };
        /** DiscountRedemptionListItem */
        DiscountRedemptionListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /** Order Public Code */
            order_public_code: string;
            /**
             * Customer User Id
             * Format: uuid
             */
            customer_user_id: string;
            /** Code Snapshot */
            code_snapshot: string;
            /** Name Snapshot */
            name_snapshot: string;
            /** Discount Amount Snapshot */
            discount_amount_snapshot: string;
            /** Minimum Order Amount Snapshot */
            minimum_order_amount_snapshot: string;
            /** Status */
            status: string;
            /**
             * Reserved At
             * Format: date-time
             */
            reserved_at: string;
            /** Consumed At */
            consumed_at?: string | null;
            /** Released At */
            released_at?: string | null;
            /** Release Reason */
            release_reason?: string | null;
        };
        /**
         * DriveBackupFileRead
         * @description Archivo REAL guardado en la carpeta de respaldos de Google Drive (fase inicial
         *     del explorador: ver qué hay y descargarlo; sin exploración todavía).
         */
        DriveBackupFileRead: {
            /** File Id */
            file_id: string;
            /** Name */
            name: string;
            /** Size Bytes */
            size_bytes?: number | null;
            /** Created Time */
            created_time?: string | null;
            /** Artifact Kind */
            artifact_kind: string;
            /** Backup Run Id */
            backup_run_id?: string | null;
        };
        /**
         * DriveBackupFilesResponse
         * @description Listado de la carpeta de Drive (más reciente primero).
         */
        DriveBackupFilesResponse: {
            /** Folder Id */
            folder_id: string;
            /** Files */
            files: components["schemas"]["DriveBackupFileRead"][];
        };
        /**
         * FieldValueType
         * @enum {string}
         */
        FieldValueType: "string" | "email" | "uuid" | "integer" | "decimal" | "boolean" | "date" | "time" | "datetime" | "enum" | "array";
        /**
         * FilterOperator
         * @enum {string}
         */
        FilterOperator: "eq" | "ne" | "contains" | "starts_with" | "ends_with" | "gte" | "lte" | "on" | "before" | "after" | "between" | "in" | "isnull";
        /**
         * FilterValueShape
         * @enum {string}
         */
        FilterValueShape: "single" | "range";
        /**
         * FilterableFieldCapability
         * @description Campo filtrable y los operadores que expone (contrato visible de filtros).
         *
         *     Fuente declarativa única: los operadores se derivan del plan compilado del recurso
         *     (``QueryOptions``/``field_operators``); el frontend no infiere parámetros ni sufijos.
         */
        FilterableFieldCapability: {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            value_type: components["schemas"]["FieldValueType"];
            /** Operators */
            operators: components["schemas"]["FilterableOperatorCapability"][];
        };
        /**
         * FilterableOperatorCapability
         * @description Un operador concreto que un campo expone como filtro visible.
         *
         *     ``parameter_name`` (operadores de un solo parámetro) y ``parameters`` (rango) son
         *     mutuamente excluyentes. ``value_shape`` indica cómo capturar el valor; ``widget``,
         *     cómo renderizarlo. Los flags opcionales describen la semántica que el frontend debe
         *     respetar pero no inferir (case-sensitivity, zona horaria de calendario, inclusión
         *     del extremo superior del rango, multiplicidad).
         */
        FilterableOperatorCapability: {
            key: components["schemas"]["FilterOperator"];
            /** Label */
            label: string;
            value_shape: components["schemas"]["FilterValueShape"];
            widget: components["schemas"]["WidgetType"];
            /** Parameter Name */
            parameter_name?: string | null;
            parameters?: components["schemas"]["FilterableRangeParameters"] | null;
            /** Case Sensitive */
            case_sensitive?: boolean | null;
            /** Calendar Timezone */
            calendar_timezone?: string | null;
            /** Range End Inclusive */
            range_end_inclusive?: boolean | null;
            /** Multiple */
            multiple?: boolean | null;
            /** Options */
            options?: components["schemas"]["ResourceFilterOption"][] | null;
            /** Max Values */
            max_values?: number | null;
            /** Placeholder */
            placeholder?: string | null;
        };
        /**
         * FilterableRangeParameters
         * @description Nombres de parámetro de los dos extremos de un operador de rango (``between``).
         */
        FilterableRangeParameters: {
            /** From */
            from: string;
            /** To */
            to: string;
        };
        /** FinancialCategoryCreate */
        FinancialCategoryCreate: {
            /**
             * Dirección
             * @enum {string}
             */
            direction: "income" | "expense";
            /** Nombre */
            name: string;
            /** Categoría padre (ID) */
            parent_id?: string | null;
        };
        /**
         * FinancialCategoryListItem
         * @description Fila del listado administrativo genérico de categorías financieras.
         */
        FinancialCategoryListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Dirección */
            direction: string;
            /** Nombre */
            name: string;
            /** Parent Id */
            parent_id?: string | null;
            /** Activa */
            is_active: boolean;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
        };
        /** FinancialCategoryRead */
        FinancialCategoryRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Direction */
            direction: string;
            /** Name */
            name: string;
            /** Parent Id */
            parent_id?: string | null;
            /** Is Active */
            is_active: boolean;
        };
        /** FinancialEntryAttachmentCreate */
        FinancialEntryAttachmentCreate: {
            /**
             * File Id
             * Format: uuid
             */
            file_id: string;
            /**
             * Document Type
             * @enum {string}
             */
            document_type: "receipt" | "invoice_pdf" | "invoice_xml" | "payment_proof" | "expense_photo" | "delivery_evidence" | "other";
            /** Description */
            description?: string | null;
        };
        /** FinancialEntryAttachmentRead */
        FinancialEntryAttachmentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * File Id
             * Format: uuid
             */
            file_id: string;
            /** Document Type */
            document_type: string;
            /** Description */
            description?: string | null;
        };
        /** FinancialEntryCreate */
        FinancialEntryCreate: {
            /**
             * Direction
             * @enum {string}
             */
            direction: "income" | "expense";
            /**
             * Entry Type
             * @enum {string}
             */
            entry_type: "manual_income" | "expense" | "delivery_expense" | "adjustment";
            /** Amount */
            amount: number | string;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
            /** Category Id */
            category_id?: string | null;
            /** Description */
            description?: string | null;
            /** Counterparty Name */
            counterparty_name?: string | null;
            /** Supplier Rfc */
            supplier_rfc?: string | null;
            /** Invoice Folio */
            invoice_folio?: string | null;
            /** Invoice Uuid */
            invoice_uuid?: string | null;
            /** Invoice Issued At */
            invoice_issued_at?: string | null;
        };
        /** FinancialEntryRead */
        FinancialEntryRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Category Id */
            category_id?: string | null;
            /** Order Id */
            order_id?: string | null;
            /** Payment Id */
            payment_id?: string | null;
            /** Reversal Of Entry Id */
            reversal_of_entry_id?: string | null;
            /** Direction */
            direction: string;
            /** Entry Type */
            entry_type: string;
            /** Amount */
            amount: string;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
            /** Status */
            status: string;
            /** Counterparty Name */
            counterparty_name?: string | null;
            /** Invoice Folio */
            invoice_folio?: string | null;
            /** Description */
            description?: string | null;
            /** Source Type */
            source_type: string;
            /** Void Reason */
            void_reason?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Attachments */
            attachments?: components["schemas"]["FinancialEntryAttachmentRead"][];
        };
        /** FinancialEntryVoidRequest */
        FinancialEntryVoidRequest: {
            /** Reason */
            reason: string;
        };
        /** FooterPatch */
        FooterPatch: {
            /** Template */
            template?: ("barra" | "columnas" | "centrado") | null;
            /** Show Slogan */
            show_slogan?: boolean | null;
            /** Show Phones */
            show_phones?: boolean | null;
            /** Show Schedule */
            show_schedule?: boolean | null;
            /** Show Links */
            show_links?: boolean | null;
            /** Note */
            note?: string | null;
            /** Color Scheme */
            color_scheme?: ("dark" | "soft" | "brand") | null;
            /** Social Links */
            social_links?: components["schemas"]["SocialLink"][] | null;
        };
        /** FooterRead */
        FooterRead: {
            /** Template */
            template: string;
            /** Show Slogan */
            show_slogan: boolean;
            /** Show Phones */
            show_phones: boolean;
            /** Show Schedule */
            show_schedule: boolean;
            /** Show Links */
            show_links: boolean;
            /** Note */
            note?: string | null;
            /** Color Scheme */
            color_scheme: string;
            /** Social Links */
            social_links?: {
                [key: string]: unknown;
            }[];
        };
        /** ForgotPasswordRequest */
        ForgotPasswordRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /**
         * FormTransport
         * @enum {string}
         */
        FormTransport: "json" | "multipart";
        /**
         * GeoPoint
         * @description GeoJSON Point: coordinates = [longitud, latitud].
         */
        GeoPoint: {
            /**
             * Type
             * @default Point
             * @constant
             */
            type: "Point";
            /** Coordinates */
            coordinates: [
                number,
                number
            ];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HealthRead */
        HealthRead: {
            /**
             * Status
             * @constant
             */
            status: "ok";
        };
        /** HeroRead */
        HeroRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Is Active */
            is_active: boolean;
            /** Sort Order */
            sort_order: number;
            /** Template */
            template: string;
            /** Eyebrow */
            eyebrow?: string | null;
            /** Title */
            title: string;
            /** Title Accent */
            title_accent?: string | null;
            /** Description */
            description?: string | null;
            /** Primary Cta */
            primary_cta?: {
                [key: string]: unknown;
            } | null;
            /** Secondary Cta */
            secondary_cta?: {
                [key: string]: unknown;
            } | null;
            /** Product Id */
            product_id?: string | null;
            /** Desktop File Id */
            desktop_file_id?: string | null;
            /** Mobile File Id */
            mobile_file_id?: string | null;
            /** Image Alt */
            image_alt?: string | null;
            /** Focal X */
            focal_x?: number | null;
            /** Focal Y */
            focal_y?: number | null;
            /** Height */
            height: string;
            /** Alignment */
            alignment: string;
            /** Color Scheme */
            color_scheme: string;
            /** Button Variant */
            button_variant: string;
            /** Overlay */
            overlay: string;
            /** Image Position */
            image_position: string;
        };
        /**
         * HeroWrite
         * @description Contrato completo de un hero (create/replace).
         */
        HeroWrite: {
            /**
             * Template
             * @default split
             * @enum {string}
             */
            template: "split" | "background" | "card" | "showcase" | "minimal";
            /**
             * Is Active
             * @default true
             */
            is_active: boolean;
            /**
             * Sort Order
             * @default 0
             */
            sort_order: number;
            /** Eyebrow */
            eyebrow?: string | null;
            /** Title */
            title: string;
            /** Title Accent */
            title_accent?: string | null;
            /** Description */
            description?: string | null;
            primary_cta?: components["schemas"]["Cta"] | null;
            secondary_cta?: components["schemas"]["Cta"] | null;
            /** Product Id */
            product_id?: string | null;
            /** Desktop File Id */
            desktop_file_id?: string | null;
            /** Mobile File Id */
            mobile_file_id?: string | null;
            /** Image Alt */
            image_alt?: string | null;
            /** Focal X */
            focal_x?: number | null;
            /** Focal Y */
            focal_y?: number | null;
            /**
             * Height
             * @default regular
             * @enum {string}
             */
            height: "compact" | "regular" | "tall";
            /**
             * Alignment
             * @default left
             * @enum {string}
             */
            alignment: "left" | "center";
            /**
             * Color Scheme
             * @default surface
             * @enum {string}
             */
            color_scheme: "surface" | "surface_muted" | "brand" | "brand_inverse" | "dark";
            /**
             * Button Variant
             * @default solid
             * @enum {string}
             */
            button_variant: "solid" | "outline";
            /**
             * Overlay
             * @default soft
             * @enum {string}
             */
            overlay: "none" | "soft" | "strong";
            /**
             * Image Position
             * @default right
             * @enum {string}
             */
            image_position: "left" | "right";
        };
        /**
         * HerosSortRequest
         * @description Reorden ATÓMICO: el set completo de heros en una sola llamada.
         */
        HerosSortRequest: {
            /** Hero Ids */
            hero_ids: string[];
        };
        /** HighlightRead */
        HighlightRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Surface */
            surface: string;
            /** Is Active */
            is_active: boolean;
            /** Sort Order */
            sort_order: number;
            /** Icon */
            icon?: string | null;
            /** Eyebrow */
            eyebrow?: string | null;
            /** Title */
            title: string;
            /** Subtitle */
            subtitle?: string | null;
            /** Cta */
            cta?: {
                [key: string]: unknown;
            } | null;
            /** Animation */
            animation: string;
            /** Color Scheme */
            color_scheme: string;
            /** Starts At */
            starts_at?: string | null;
            /** Ends At */
            ends_at?: string | null;
        };
        /** HighlightWrite */
        HighlightWrite: {
            /**
             * Surface
             * @enum {string}
             */
            surface: "global" | "home" | "login" | "register" | "cart" | "checkout" | "account";
            /**
             * Is Active
             * @default true
             */
            is_active: boolean;
            /**
             * Sort Order
             * @default 0
             */
            sort_order: number;
            /** Icon */
            icon?: string | null;
            /** Eyebrow */
            eyebrow?: string | null;
            /** Title */
            title: string;
            /** Subtitle */
            subtitle?: string | null;
            cta?: components["schemas"]["Cta"] | null;
            /**
             * Animation
             * @default fade_in
             * @enum {string}
             */
            animation: "none" | "fade_in" | "slide_down" | "rise" | "pulse" | "shimmer" | "marquee";
            /**
             * Color Scheme
             * @default brand
             * @enum {string}
             */
            color_scheme: "brand" | "soft" | "accent";
            /** Starts At */
            starts_at?: string | null;
            /** Ends At */
            ends_at?: string | null;
        };
        /**
         * HttpMethod
         * @enum {string}
         */
        HttpMethod: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
        /**
         * ItemReference
         * @description Referencia pública y estable de un item de listado.
         *
         *     No se llama ``primary_key`` ni expone bindings ORM: declara qué campo de cada
         *     item identifica el recurso (``field``), qué token usan las plantillas de URL
         *     (``placeholder``, p. ej. ``{id}``) y su tipo. El frontend nunca asume ``id``.
         */
        ItemReference: {
            /** Field */
            field: string;
            /** Placeholder */
            placeholder: string;
            type: components["schemas"]["FieldValueType"];
        };
        /** LocationReportRequest */
        LocationReportRequest: {
            location: components["schemas"]["GeoPoint"];
            /** Accuracy Meters */
            accuracy_meters?: number | string | null;
        };
        /** LoginRequest */
        LoginRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Password
             * Format: password
             */
            password: string;
        };
        /**
         * LoginResponse
         * @description Desenlace del login: sesión creada o reto de verificación por correo.
         */
        LoginResponse: {
            /** Message */
            message: string;
            /**
             * Verification Required
             * @default false
             */
            verification_required: boolean;
            /** Verification Mode */
            verification_mode?: string | null;
        };
        /**
         * LoginVerifyRequest
         * @description Secreto del reto: el código de 6 dígitos o el token del enlace.
         */
        LoginVerifyRequest: {
            /** Code */
            code: string;
        };
        /** MessageResponse */
        MessageResponse: {
            /** Message */
            message: string;
        };
        /** ModifierGroupCreate */
        ModifierGroupCreate: {
            /** Nombre */
            name: string;
            /**
             * Tipo de selección
             * @default single
             * @enum {string}
             */
            selection_type: "single" | "multiple";
            /**
             * Selecciones mínimas
             * @default 0
             */
            min_selections: number;
            /** Selecciones máximas */
            max_selections?: number | null;
            /**
             * Obligatorio
             * @default false
             */
            is_required: boolean;
        };
        /**
         * ModifierGroupListItem
         * @description Fila del listado administrativo genérico de grupos de modificadores.
         *
         *     Sin las opciones anidadas: se administran en los endpoints especializados del
         *     grupo (crear/editar/reordenar opciones).
         */
        ModifierGroupListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre */
            name: string;
            /** Tipo de selección */
            selection_type: string;
            /** Mínimo */
            min_selections: number;
            /** Máximo */
            max_selections?: number | null;
            /** Obligatorio */
            is_required: boolean;
            /** Orden */
            sort_order: number;
            /** Activo */
            is_active: boolean;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /** ModifierGroupRead */
        ModifierGroupRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Selection Type */
            selection_type: string;
            /** Min Selections */
            min_selections: number;
            /** Max Selections */
            max_selections?: number | null;
            /** Is Required */
            is_required: boolean;
            /** Sort Order */
            sort_order: number;
            /** Is Active */
            is_active: boolean;
            /** Options */
            options?: components["schemas"]["ModifierOptionRead"][];
        };
        /** ModifierGroupUpdate */
        ModifierGroupUpdate: {
            /** Nombre */
            name?: string | null;
            /** Tipo de selección */
            selection_type?: ("single" | "multiple") | null;
            /** Selecciones mínimas */
            min_selections?: number | null;
            /** Selecciones máximas */
            max_selections?: number | null;
            /** Obligatorio */
            is_required?: boolean | null;
            /** Activo */
            is_active?: boolean | null;
        };
        /** ModifierOptionCreate */
        ModifierOptionCreate: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /**
             * Price Adjustment
             * @default 0
             */
            price_adjustment: number | string;
        };
        /** ModifierOptionRead */
        ModifierOptionRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Price Adjustment */
            price_adjustment: string;
            /** Sort Order */
            sort_order: number;
            /** Is Available */
            is_available: boolean;
            /** Is Active */
            is_active: boolean;
        };
        /** ModifierOptionUpdate */
        ModifierOptionUpdate: {
            /** Name */
            name?: string | null;
            /** Description */
            description?: string | null;
            /** Price Adjustment */
            price_adjustment?: number | string | null;
            /** Is Available */
            is_available?: boolean | null;
            /** Is Active */
            is_active?: boolean | null;
        };
        /**
         * MyActiveDelivery
         * @description Entrega vigente del propio repartidor: la cola + el estado de SU asignación.
         */
        MyActiveDelivery: {
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /**
             * Order Delivery Id
             * Format: uuid
             */
            order_delivery_id: string;
            /** Public Code */
            public_code: string;
            /** Customer Name */
            customer_name?: string | null;
            /** Address Summary */
            address_summary: string;
            /** Zone Name */
            zone_name?: string | null;
            /** Collection Label */
            collection_label: string;
            /** Ready Since */
            ready_since?: string | null;
            /** Recipient Phone */
            recipient_phone?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Total Amount */
            total_amount?: string | null;
            /** Visible Notes */
            visible_notes?: string[];
            /** Assignment Status */
            assignment_status: string;
        };
        /** MyNotifications */
        MyNotifications: {
            /** Unread Count */
            unread_count: number;
            /** Items */
            items?: components["schemas"]["NotificationRead"][];
        };
        /**
         * MyOrderRead
         * @description Vista del CLIENTE: etiqueta pública, sin datos internos (§58.2).
         */
        MyOrderRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Public Code */
            public_code: string;
            /** Status */
            status: string;
            /** Status Label */
            status_label: string;
            /** Fulfillment Type */
            fulfillment_type: string;
            /** Purchase Mode */
            purchase_mode: string;
            /** Items Subtotal Amount */
            items_subtotal_amount: string;
            /**
             * Discount Total Amount
             * @default 0
             */
            discount_total_amount: string;
            /** Discount Code Label */
            discount_code_label?: string | null;
            /** Shipping Amount */
            shipping_amount?: string | null;
            /** Shipping Pending Review */
            shipping_pending_review: boolean;
            /** Shipping Estimated Minutes */
            shipping_estimated_minutes?: number | null;
            /** Estimated Delivery At */
            estimated_delivery_at?: string | null;
            /** Total Money Amount */
            total_money_amount?: string | null;
            /** Credits Earned Total Snapshot */
            credits_earned_total_snapshot: number;
            /** Credits Redeemed Total */
            credits_redeemed_total: number;
            /** Customer Note */
            customer_note?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Lines */
            lines?: components["schemas"]["OrderLineRead"][];
            delivery?: components["schemas"]["OrderDeliveryRead"] | null;
            courier?: components["schemas"]["PublicCourierInfo"] | null;
            /** Visible Notes */
            visible_notes?: components["schemas"]["OrderVisibleNoteRead"][];
        };
        /**
         * NavigationModule
         * @description Módulo ESPECIALIZADO navegable (pantalla propia, no tabla genérica).
         *
         *     Contrato mínimo de navegación: el frontend solo enlaza (``href``) según la
         *     sección (``admin`` o ``panel``); no describe columnas ni formularios — esos
         *     viven en la pantalla especializada. ``required_permissions`` es un *anyOf*:
         *     el módulo se proyecta si el usuario tiene ALGUNO de esos permisos (y el
         *     backend de cada pantalla revalida siempre los suyos).
         */
        NavigationModule: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Href */
            href: string;
            /**
             * Section
             * @enum {string}
             */
            section: "admin" | "panel";
            /** Required Permissions */
            required_permissions: string[];
        };
        /** NotificationRead */
        NotificationRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Kind */
            kind: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
            /** Order Id */
            order_id?: string | null;
            /** Read At */
            read_at?: string | null;
            /** Created At */
            created_at: string;
        };
        /** OffsetPage[AuditEventListItem] */
        OffsetPage_AuditEventListItem_: {
            /** Items */
            items: components["schemas"]["AuditEventListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[BackupRunListItem] */
        OffsetPage_BackupRunListItem_: {
            /** Items */
            items: components["schemas"]["BackupRunListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[BackupSettingsListItem] */
        OffsetPage_BackupSettingsListItem_: {
            /** Items */
            items: components["schemas"]["BackupSettingsListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[CategoryListItem] */
        OffsetPage_CategoryListItem_: {
            /** Items */
            items: components["schemas"]["CategoryListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[DeliveryZoneListItem] */
        OffsetPage_DeliveryZoneListItem_: {
            /** Items */
            items: components["schemas"]["DeliveryZoneListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[FinancialCategoryListItem] */
        OffsetPage_FinancialCategoryListItem_: {
            /** Items */
            items: components["schemas"]["FinancialCategoryListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ModifierGroupListItem] */
        OffsetPage_ModifierGroupListItem_: {
            /** Items */
            items: components["schemas"]["ModifierGroupListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[OrderListItem] */
        OffsetPage_OrderListItem_: {
            /** Items */
            items: components["schemas"]["OrderListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PaymentMethodConfigListItem] */
        OffsetPage_PaymentMethodConfigListItem_: {
            /** Items */
            items: components["schemas"]["PaymentMethodConfigListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ProductListItem] */
        OffsetPage_ProductListItem_: {
            /** Items */
            items: components["schemas"]["ProductListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[RoleListItem] */
        OffsetPage_RoleListItem_: {
            /** Items */
            items: components["schemas"]["RoleListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[RoleRead] */
        OffsetPage_RoleRead_: {
            /** Items */
            items: components["schemas"]["RoleRead"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[SystemSettingsListItem] */
        OffsetPage_SystemSettingsListItem_: {
            /** Items */
            items: components["schemas"]["SystemSettingsListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[UserAdminListItem] */
        OffsetPage_UserAdminListItem_: {
            /** Items */
            items: components["schemas"]["UserAdminListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPagination */
        OffsetPagination: {
            /**
             * Limit
             * @default 20
             */
            limit: number;
            /**
             * Offset
             * @default 0
             */
            offset: number;
            /** Has Next */
            has_next: boolean;
            /** Total */
            total: number;
        };
        /**
         * OptionsSourceType
         * @enum {string}
         */
        OptionsSourceType: "list" | "grouped_catalog";
        /** OrderAdjustmentCreate */
        OrderAdjustmentCreate: {
            /**
             * Adjustment Type
             * @enum {string}
             */
            adjustment_type: "discount" | "promotion" | "courtesy" | "manual_fee";
            /**
             * Direction
             * @enum {string}
             */
            direction: "charge" | "discount";
            /** Amount */
            amount: number | string;
            /** Reason */
            reason: string;
        };
        /** OrderAdjustmentRead */
        OrderAdjustmentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Adjustment Type */
            adjustment_type: string;
            /** Direction */
            direction: string;
            /** Amount */
            amount: string;
            /** Reason */
            reason: string;
        };
        /** OrderDeliveryRead */
        OrderDeliveryRead: {
            /** Recipient Name */
            recipient_name: string;
            /** Recipient Phone */
            recipient_phone: string;
            /** Street */
            street: string;
            /** External Number */
            external_number?: string | null;
            /** Internal Number */
            internal_number?: string | null;
            /** Neighborhood */
            neighborhood?: string | null;
            /** City */
            city?: string | null;
            /** Postal Code */
            postal_code?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Location Source */
            location_source: string;
            /** Delivery Note */
            delivery_note?: string | null;
            /** Delivered At */
            delivered_at?: string | null;
        };
        /** OrderLineInput */
        OrderLineInput: {
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /** Quantity */
            quantity: number;
            /**
             * Purchase Mode
             * @default money
             * @enum {string}
             */
            purchase_mode: "money" | "credits";
            /** Modifiers */
            modifiers?: components["schemas"]["OrderModifierInput"][];
            /** Customer Note */
            customer_note?: string | null;
        };
        /** OrderLineModifierRead */
        OrderLineModifierRead: {
            /** Group Name Snapshot */
            group_name_snapshot: string;
            /** Option Name Snapshot */
            option_name_snapshot: string;
            /** Quantity */
            quantity: number;
            /** Unit Price Adjustment */
            unit_price_adjustment: string;
            /** Total Amount */
            total_amount: string;
        };
        /** OrderLineRead */
        OrderLineRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Product Id */
            product_id?: string | null;
            /** Product Name Snapshot */
            product_name_snapshot: string;
            /** Quantity */
            quantity: number;
            /** Purchase Mode */
            purchase_mode: string;
            /** Money Unit Price Snapshot */
            money_unit_price_snapshot: string;
            /** Modifier Money Total Per Unit */
            modifier_money_total_per_unit: string;
            /** Money Line Total Amount */
            money_line_total_amount: string;
            /** Credits Earned Total Snapshot */
            credits_earned_total_snapshot: number;
            /** Credits Redeemed Total */
            credits_redeemed_total: number;
            /** Customer Note */
            customer_note?: string | null;
            /** Modifiers */
            modifiers?: components["schemas"]["OrderLineModifierRead"][];
        };
        /** OrderListItem */
        OrderListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Public Code */
            public_code: string;
            /** Source */
            source: string;
            /** Fulfillment Type */
            fulfillment_type: string;
            /** Purchase Mode */
            purchase_mode: string;
            /** Status */
            status: string;
            /** Payment Status */
            payment_status: string;
            /** Customer Name Snapshot */
            customer_name_snapshot?: string | null;
            /** Items Subtotal Amount */
            items_subtotal_amount: string;
            /** Shipping Total Amount */
            shipping_total_amount?: string | null;
            /** Total Money Amount */
            total_money_amount?: string | null;
            /** Approved At */
            approved_at?: string | null;
            /** Approved By Name */
            approved_by_name?: string | null;
            /** Payment Method Label */
            payment_method_label?: string | null;
            /** Completed At */
            completed_at?: string | null;
            /** Cancelled At */
            cancelled_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** OrderModifierInput */
        OrderModifierInput: {
            /**
             * Modifier Option Id
             * Format: uuid
             */
            modifier_option_id: string;
            /**
             * Quantity
             * @default 1
             */
            quantity: number;
        };
        /**
         * OrderRead
         * @description Vista interna completa (panel).
         */
        OrderRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Order Number */
            order_number: number;
            /** Public Code */
            public_code: string;
            /** Customer User Id */
            customer_user_id?: string | null;
            /** Source */
            source: string;
            /** Fulfillment Type */
            fulfillment_type: string;
            /** Purchase Mode */
            purchase_mode: string;
            /** Status */
            status: string;
            /** Payment Status */
            payment_status: string;
            /** Customer Name Snapshot */
            customer_name_snapshot?: string | null;
            /** Customer Phone Snapshot */
            customer_phone_snapshot?: string | null;
            /** Items Subtotal Amount */
            items_subtotal_amount: string;
            /** Discount Total Amount */
            discount_total_amount: string;
            /** Shipping Total Amount */
            shipping_total_amount?: string | null;
            /** Total Money Amount */
            total_money_amount?: string | null;
            /** Credits Earned Total Snapshot */
            credits_earned_total_snapshot: number;
            /** Credits Redeemed Total */
            credits_redeemed_total: number;
            /** Customer Note */
            customer_note?: string | null;
            /** Internal Note */
            internal_note?: string | null;
            /** Cancellation Money Resolution */
            cancellation_money_resolution?: string | null;
            /** Cancellation Resolution Note */
            cancellation_resolution_note?: string | null;
            /** Approved At */
            approved_at?: string | null;
            /** Approved By Name */
            approved_by_name?: string | null;
            /** Completed At */
            completed_at?: string | null;
            /** Cancelled At */
            cancelled_at?: string | null;
            /** Created By */
            created_by?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Lines */
            lines?: components["schemas"]["OrderLineRead"][];
            /** Adjustments */
            adjustments?: components["schemas"]["OrderAdjustmentRead"][];
            shipping?: components["schemas"]["OrderShippingRead"] | null;
            delivery?: components["schemas"]["OrderDeliveryRead"] | null;
            /** Visible Notes */
            visible_notes?: components["schemas"]["OrderVisibleNoteRead"][];
            /** Status History */
            status_history?: components["schemas"]["OrderStatusHistoryRead"][];
        };
        /**
         * OrderShippingFinalizeRequest
         * @description Fija el envío (§17.2): tarifa existente O monto manual con motivo O
         *     ubicación en mapa (el backend recotiza por polígono y fija el resultado).
         *
         *     ``location`` además PERSISTE el pin en la entrega (location_source
         *     employee_selected); puede acompañar al monto manual cuando el punto queda
         *     fuera de zona pero conviene guardar la ubicación de todos modos.
         */
        OrderShippingFinalizeRequest: {
            /** Shipping Rate Rule Id */
            shipping_rate_rule_id?: string | null;
            /** Final Amount */
            final_amount?: number | string | null;
            /** Reason */
            reason?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
        };
        /** OrderShippingRead */
        OrderShippingRead: {
            /** Calculation Status */
            calculation_status: string;
            /** Calculation Source */
            calculation_source: string;
            /** Delivery Zone Name Snapshot */
            delivery_zone_name_snapshot?: string | null;
            /** Shipping Rate Name Snapshot */
            shipping_rate_name_snapshot?: string | null;
            /** Estimated Amount */
            estimated_amount?: string | null;
            /** Final Amount */
            final_amount?: string | null;
            /** Is Free Shipping */
            is_free_shipping: boolean;
            /** Estimated Minutes */
            estimated_minutes?: number | null;
        };
        /**
         * OrderStatusHistoryRead
         * @description Bitácora INTERNA completa de una transición (§15.4): la ve el equipo en
         *     el detalle del panel (quién aprobó/preparó/completó, motivo de cancelación,
         *     notas por transición). Incluye la nota interna — jamás sale a la vista del
         *     cliente, que sólo recibe ``visible_notes``. ``changed_by_name`` se resuelve
         *     en el endpoint (join a ``User``).
         */
        OrderStatusHistoryRead: {
            /** Previous Status */
            previous_status?: string | null;
            /** New Status */
            new_status: string;
            /** Reason Code */
            reason_code?: string | null;
            /** Internal Note */
            internal_note?: string | null;
            /** Customer Visible Note */
            customer_visible_note?: string | null;
            /** Changed By Name */
            changed_by_name?: string | null;
            /**
             * Changed At
             * Format: date-time
             */
            changed_at: string;
        };
        /** OrderTransitionRequest */
        OrderTransitionRequest: {
            /** New Status */
            new_status: string;
            /** Payment Resolution */
            payment_resolution?: ("refund_now" | "refund_pending" | "retain") | null;
            /** Resolution Reason */
            resolution_reason?: string | null;
            /** Reason Code */
            reason_code?: string | null;
            /** Internal Note */
            internal_note?: string | null;
            /** Customer Visible Note */
            customer_visible_note?: string | null;
        };
        /**
         * OrderVisibleNoteRead
         * @description Aclaración registrada en una transición (p. ej. al aprobar) y visible
         *     fuera del equipo: la ven el cliente en su seguimiento y el repartidor en
         *     su entrega, además del panel. La nota interna NUNCA sale por aquí.
         */
        OrderVisibleNoteRead: {
            /** New Status */
            new_status: string;
            /** Note */
            note: string;
            /**
             * Changed At
             * Format: date-time
             */
            changed_at: string;
        };
        /** PaginationCapability */
        PaginationCapability: {
            /** Default Limit */
            default_limit: number;
            /** Max Limit */
            max_limit: number;
        };
        /** PaymentAttachmentCreate */
        PaymentAttachmentCreate: {
            /**
             * File Id
             * Format: uuid
             */
            file_id: string;
            /**
             * Attachment Type
             * @enum {string}
             */
            attachment_type: "payment_proof" | "terminal_receipt" | "refund_proof" | "other";
            /** Description */
            description?: string | null;
        };
        /** PaymentAttachmentRead */
        PaymentAttachmentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * File Id
             * Format: uuid
             */
            file_id: string;
            /** Attachment Type */
            attachment_type: string;
            /** Description */
            description?: string | null;
        };
        /** PaymentCreate */
        PaymentCreate: {
            /** Method Code */
            method_code: string;
            /** Expected Amount */
            expected_amount?: number | string | null;
            /** Change Requested For Amount */
            change_requested_for_amount?: number | string | null;
            /** Transaction Reference */
            transaction_reference?: string | null;
            /** Bank Name */
            bank_name?: string | null;
            /** Terminal Name */
            terminal_name?: string | null;
            /** Card Last Four */
            card_last_four?: string | null;
            /** Notes */
            notes?: string | null;
        };
        /** PaymentMethodConfigCreate */
        PaymentMethodConfigCreate: {
            /** Código (minúsculas, sin espacios) */
            code: string;
            /** Nombre visible */
            display_name: string;
            /** Instrucciones para el cliente */
            instructions?: string | null;
            /**
             * Disponible en línea
             * @default true
             */
            available_online: boolean;
            /**
             * Disponible en mostrador
             * @default true
             */
            available_pos: boolean;
            /**
             * Requiere verificación manual
             * @default false
             */
            requires_manual_verification: boolean;
            /**
             * Requiere referencia
             * @default false
             */
            requires_transaction_reference: boolean;
            /**
             * Requiere banco
             * @default false
             */
            requires_bank_name: boolean;
            /**
             * Requiere comprobante
             * @default false
             */
            requires_payment_proof: boolean;
            /**
             * Permite cambio en efectivo
             * @default false
             */
            allows_cash_change: boolean;
            /**
             * Orden
             * @default 0
             */
            sort_order: number;
        };
        /**
         * PaymentMethodConfigListItem
         * @description Fila del listado administrativo genérico de métodos de pago.
         */
        PaymentMethodConfigListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Código */
            code: string;
            /** Nombre */
            display_name: string;
            /** En línea */
            available_online: boolean;
            /** Mostrador */
            available_pos: boolean;
            /** Verificación manual */
            requires_manual_verification: boolean;
            /** Da cambio */
            allows_cash_change: boolean;
            /** Activo */
            is_active: boolean;
            /** Orden */
            sort_order: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** PaymentMethodConfigRead */
        PaymentMethodConfigRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Code */
            code: string;
            /** Display Name */
            display_name: string;
            /** Instructions */
            instructions?: string | null;
            /** Available Online */
            available_online: boolean;
            /** Available Pos */
            available_pos: boolean;
            /** Requires Manual Verification */
            requires_manual_verification: boolean;
            /** Requires Transaction Reference */
            requires_transaction_reference: boolean;
            /** Requires Bank Name */
            requires_bank_name: boolean;
            /** Requires Payment Proof */
            requires_payment_proof: boolean;
            /** Allows Cash Change */
            allows_cash_change: boolean;
            /** Is Active */
            is_active: boolean;
            /** Sort Order */
            sort_order: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PaymentMethodConfigUpdate
         * @description PATCH parcial; el ``code`` es INMUTABLE (los pagos históricos lo citan
         *     vía snapshot y el checkout lo referencia — cambiarlo rompería enlaces).
         */
        PaymentMethodConfigUpdate: {
            /** Nombre visible */
            display_name?: string | null;
            /** Instrucciones para el cliente */
            instructions?: string | null;
            /** Disponible en línea */
            available_online?: boolean | null;
            /** Disponible en mostrador */
            available_pos?: boolean | null;
            /** Requiere verificación manual */
            requires_manual_verification?: boolean | null;
            /** Requiere referencia */
            requires_transaction_reference?: boolean | null;
            /** Requiere banco */
            requires_bank_name?: boolean | null;
            /** Requiere comprobante */
            requires_payment_proof?: boolean | null;
            /** Permite cambio en efectivo */
            allows_cash_change?: boolean | null;
            /** Orden */
            sort_order?: number | null;
            /** Is Active */
            is_active?: boolean | null;
        };
        /**
         * PaymentMethodPublic
         * @description Método visible al elegir cómo pagar (sitio público y POS).
         */
        PaymentMethodPublic: {
            /** Code */
            code: string;
            /** Display Name */
            display_name: string;
            /** Instructions */
            instructions?: string | null;
            /** Requires Transaction Reference */
            requires_transaction_reference: boolean;
            /** Requires Bank Name */
            requires_bank_name: boolean;
            /** Requires Payment Proof */
            requires_payment_proof: boolean;
            /** Allows Cash Change */
            allows_cash_change: boolean;
        };
        /** PaymentRead */
        PaymentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /** Payment Method Name Snapshot */
            payment_method_name_snapshot: string;
            /** Status */
            status: string;
            /** Expected Amount */
            expected_amount: string;
            /** Received Amount */
            received_amount: string;
            /** Change Requested For Amount */
            change_requested_for_amount?: string | null;
            /** Change Amount */
            change_amount: string;
            /** Transaction Reference */
            transaction_reference?: string | null;
            /** Bank Name */
            bank_name?: string | null;
            /** Terminal Name */
            terminal_name?: string | null;
            /** Card Last Four */
            card_last_four?: string | null;
            /** Rejected Reason */
            rejected_reason?: string | null;
            /** Notes */
            notes?: string | null;
            /** Paid At */
            paid_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Attachments */
            attachments?: components["schemas"]["PaymentAttachmentRead"][];
        };
        /** PaymentVerifyRequest */
        PaymentVerifyRequest: {
            /** Approve */
            approve: boolean;
            /** Received Amount */
            received_amount?: number | string | null;
            /** Rejected Reason */
            rejected_reason?: string | null;
        };
        /** PermissionGroupRead */
        PermissionGroupRead: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Permissions */
            permissions: components["schemas"]["PermissionRead"][];
        };
        /** PermissionRead */
        PermissionRead: {
            /** Access */
            access: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
        };
        /** PosPaymentInput */
        PosPaymentInput: {
            /** Method Code */
            method_code: string;
            /** Change Requested For Amount */
            change_requested_for_amount?: number | string | null;
            /** Transaction Reference */
            transaction_reference?: string | null;
            /** Bank Name */
            bank_name?: string | null;
            /** Terminal Name */
            terminal_name?: string | null;
            /** Card Last Four */
            card_last_four?: string | null;
        };
        /** PosSaleRequest */
        PosSaleRequest: {
            /** Lines */
            lines: components["schemas"]["OrderLineInput"][];
            /**
             * Source
             * @default counter
             * @enum {string}
             */
            source: "counter" | "phone" | "whatsapp" | "social" | "manual";
            /** Customer User Id */
            customer_user_id?: string | null;
            /** Customer Name */
            customer_name?: string | null;
            payment: components["schemas"]["PosPaymentInput"];
            /** Internal Note */
            internal_note?: string | null;
        };
        /** PosSaleResult */
        PosSaleResult: {
            order: components["schemas"]["OrderRead"];
            payment: components["schemas"]["PaymentRead"];
        };
        /** ProductCreate */
        ProductCreate: {
            /**
             * Categoría (ID)
             * Format: uuid
             */
            category_id: string;
            /** SKU */
            sku?: string | null;
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Precio */
            money_price_amount?: number | string | null;
            /**
             * Venta por dinero
             * @default true
             */
            is_money_purchase_available: boolean;
            /**
             * Créditos por unidad
             * @default 0
             */
            credits_awarded_per_unit: number;
            /** Precio en créditos */
            credit_redemption_price?: number | null;
            /**
             * Disponible
             * @default true
             */
            is_available: boolean;
            /**
             * Destacado
             * @default false
             */
            is_featured: boolean;
            /** Minutos de preparación */
            preparation_minutes?: number | null;
            /** Máximo por pedido */
            max_units_per_order?: number | null;
            /** Límite diario */
            daily_unit_limit?: number | null;
        };
        /** ProductImageAttach */
        ProductImageAttach: {
            /**
             * File Id
             * Format: uuid
             */
            file_id: string;
            /** Alt Text */
            alt_text?: string | null;
            /**
             * Is Primary
             * @default false
             */
            is_primary: boolean;
        };
        /** ProductImageRead */
        ProductImageRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * File Id
             * Format: uuid
             */
            file_id: string;
            /** Alt Text */
            alt_text?: string | null;
            /** Sort Order */
            sort_order: number;
            /** Is Primary */
            is_primary: boolean;
        };
        /** ProductInclusionItem */
        ProductInclusionItem: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
        };
        /** ProductInclusionRead */
        ProductInclusionRead: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Sort Order */
            sort_order: number;
        };
        /**
         * ProductInclusionsReplace
         * @description PUT de inclusiones: la lista enviada (en orden) sustituye TODO.
         */
        ProductInclusionsReplace: {
            /** Inclusions */
            inclusions: components["schemas"]["ProductInclusionItem"][];
        };
        /**
         * ProductListItem
         * @description Fila del listado administrativo genérico de productos.
         *
         *     Sin imágenes, inclusiones ni modificadores: esas colecciones se administran
         *     en la pantalla especializada del catálogo, no en la tabla genérica.
         */
        ProductListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Categoría
             * Format: uuid
             */
            category_id: string;
            /** Nombre */
            name: string;
            /** SKU */
            sku?: string | null;
            /** Precio */
            money_price_amount?: string | null;
            /** Precio en créditos */
            credit_redemption_price?: number | null;
            /** Disponible */
            is_available: boolean;
            /** Destacado */
            is_featured: boolean;
            /** Orden */
            sort_order: number;
            /** Activo */
            is_active: boolean;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /** ProductModifierGroupItem */
        ProductModifierGroupItem: {
            /**
             * Modifier Group Id
             * Format: uuid
             */
            modifier_group_id: string;
            /** Min Selections Override */
            min_selections_override?: number | null;
            /** Max Selections Override */
            max_selections_override?: number | null;
        };
        /** ProductModifierGroupRead */
        ProductModifierGroupRead: {
            /**
             * Modifier Group Id
             * Format: uuid
             */
            modifier_group_id: string;
            /** Name */
            name: string;
            /** Min Selections Override */
            min_selections_override?: number | null;
            /** Max Selections Override */
            max_selections_override?: number | null;
            /** Sort Order */
            sort_order: number;
        };
        /**
         * ProductModifierGroupsReplace
         * @description PUT de grupos del producto: la lista (en orden) sustituye TODO el vínculo.
         */
        ProductModifierGroupsReplace: {
            /** Groups */
            groups: components["schemas"]["ProductModifierGroupItem"][];
        };
        /** ProductRead */
        ProductRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Category Id
             * Format: uuid
             */
            category_id: string;
            /** Sku */
            sku?: string | null;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Money Price Amount */
            money_price_amount?: string | null;
            /** Is Money Purchase Available */
            is_money_purchase_available: boolean;
            /** Credits Awarded Per Unit */
            credits_awarded_per_unit: number;
            /** Credit Redemption Price */
            credit_redemption_price?: number | null;
            /** Is Available */
            is_available: boolean;
            /** Is Featured */
            is_featured: boolean;
            /** Preparation Minutes */
            preparation_minutes?: number | null;
            /** Max Units Per Order */
            max_units_per_order?: number | null;
            /** Daily Unit Limit */
            daily_unit_limit?: number | null;
            /** Sort Order */
            sort_order: number;
            /** Is Active */
            is_active: boolean;
            /** Images */
            images?: components["schemas"]["ProductImageRead"][];
            /** Inclusions */
            inclusions?: components["schemas"]["ProductInclusionRead"][];
        };
        /** ProductUpdate */
        ProductUpdate: {
            /** Categoría (ID) */
            category_id?: string | null;
            /** SKU */
            sku?: string | null;
            /** Nombre */
            name?: string | null;
            /** Descripción */
            description?: string | null;
            /** Precio */
            money_price_amount?: number | string | null;
            /** Venta por dinero */
            is_money_purchase_available?: boolean | null;
            /** Créditos por unidad */
            credits_awarded_per_unit?: number | null;
            /** Precio en créditos */
            credit_redemption_price?: number | null;
            /** Disponible */
            is_available?: boolean | null;
            /** Destacado */
            is_featured?: boolean | null;
            /** Minutos de preparación */
            preparation_minutes?: number | null;
            /** Máximo por pedido */
            max_units_per_order?: number | null;
            /** Límite diario */
            daily_unit_limit?: number | null;
            /** Activo */
            is_active?: boolean | null;
        };
        /** PublicBusinessPhone */
        PublicBusinessPhone: {
            /** Label */
            label?: string | null;
            /** Phone */
            phone: string;
            /** Phone Normalized */
            phone_normalized: string;
            /** Is Whatsapp */
            is_whatsapp: boolean;
        };
        /**
         * PublicBusinessRead
         * @description Lo que el sitio público necesita del negocio; nada interno.
         */
        PublicBusinessRead: {
            /** Trade Name */
            trade_name: string;
            /** Slogan */
            slogan?: string | null;
            /** Logo File Id */
            logo_file_id?: string | null;
            /** Currency Code */
            currency_code: string;
            /** Timezone */
            timezone: string;
            /** Is Accepting Orders */
            is_accepting_orders: boolean;
            /** Is Open Now */
            is_open_now: boolean;
            /** Online Orders Require Open Hours */
            online_orders_require_open_hours: boolean;
            /** Today Slots */
            today_slots: components["schemas"]["PublicDaySlot"][];
            /** Phones */
            phones: components["schemas"]["PublicBusinessPhone"][];
            /** Allow Online Orders */
            allow_online_orders: boolean;
            /** Allow Delivery */
            allow_delivery: boolean;
            /** Allow Pickup */
            allow_pickup: boolean;
            /** Minimum Delivery Order Amount */
            minimum_delivery_order_amount?: string | null;
            /** Free Shipping Global From Amount */
            free_shipping_global_from_amount?: string | null;
        };
        /** PublicCarousel */
        PublicCarousel: {
            /**
             * Autoplay
             * @default true
             */
            autoplay: boolean;
            /**
             * Interval Seconds
             * @default 6
             */
            interval_seconds: number;
            /**
             * Transition
             * @default slide
             */
            transition: string;
            /**
             * Show Arrows
             * @default true
             */
            show_arrows: boolean;
            /**
             * Show Dots
             * @default true
             */
            show_dots: boolean;
        };
        /**
         * PublicCourierInfo
         * @description Lo único del repartidor que ve el cliente, sólo en camino (§19.2).
         *
         *     ``cash_change_amount``: cambio que lleva el repartidor cuando el pedido se
         *     cobra en efectivo contra entrega («lleva tu cambio de $X»).
         */
        PublicCourierInfo: {
            /** Name */
            name: string;
            /** Public Phone */
            public_phone?: string | null;
            /** Public Note */
            public_note?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Location At */
            location_at?: string | null;
            /** Cash Change Amount */
            cash_change_amount?: string | null;
        };
        /** PublicCta */
        PublicCta: {
            /** Label */
            label: string;
            /** Link Type */
            link_type: string;
            /** Target */
            target?: string | null;
        };
        /** PublicDaySlot */
        PublicDaySlot: {
            /**
             * Opens At
             * Format: time
             */
            opens_at: string;
            /**
             * Closes At
             * Format: time
             */
            closes_at: string;
        };
        /** PublicFooter */
        PublicFooter: {
            /**
             * Template
             * @default barra
             */
            template: string;
            /**
             * Color Scheme
             * @default dark
             */
            color_scheme: string;
            /** Slogan */
            slogan?: string | null;
            /** Phones */
            phones?: components["schemas"]["PublicFooterPhone"][];
            schedule?: components["schemas"]["PublicFooterSchedule"] | null;
            /**
             * Show Links
             * @default true
             */
            show_links: boolean;
            /** Address */
            address?: string | null;
            /** Social Links */
            social_links?: components["schemas"]["PublicSocialLink"][];
        };
        /** PublicFooterPhone */
        PublicFooterPhone: {
            /** Label */
            label?: string | null;
            /** Phone */
            phone: string;
            /** Phone Normalized */
            phone_normalized: string;
            /**
             * Is Whatsapp
             * @default false
             */
            is_whatsapp: boolean;
        };
        /** PublicFooterSchedule */
        PublicFooterSchedule: {
            /**
             * Is Open Now
             * @default false
             */
            is_open_now: boolean;
            /** Today Slots */
            today_slots?: {
                [key: string]: unknown;
            }[];
        };
        /** PublicHero */
        PublicHero: {
            /** Id */
            id: string;
            /** Template */
            template: string;
            /** Eyebrow */
            eyebrow?: string | null;
            /** Title */
            title: string;
            /** Title Accent */
            title_accent?: string | null;
            /** Description */
            description?: string | null;
            primary_cta?: components["schemas"]["PublicCta"] | null;
            secondary_cta?: components["schemas"]["PublicCta"] | null;
            product?: components["schemas"]["PublicHeroProduct"] | null;
            image?: components["schemas"]["PublicHeroImage"];
            /**
             * Height
             * @default regular
             */
            height: string;
            /**
             * Alignment
             * @default left
             */
            alignment: string;
            /**
             * Color Scheme
             * @default surface
             */
            color_scheme: string;
            /**
             * Button Variant
             * @default solid
             */
            button_variant: string;
            /**
             * Overlay
             * @default soft
             */
            overlay: string;
            /**
             * Image Position
             * @default right
             */
            image_position: string;
        };
        /** PublicHeroImage */
        PublicHeroImage: {
            /** Desktop File Id */
            desktop_file_id?: string | null;
            /** Mobile File Id */
            mobile_file_id?: string | null;
            /** Alt Text */
            alt_text?: string | null;
            /** Focal X */
            focal_x?: number | null;
            /** Focal Y */
            focal_y?: number | null;
        };
        /**
         * PublicHeroProduct
         * @description Binding real del showcase: catálogo vivo, nunca precio manual.
         */
        PublicHeroProduct: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Money Price Amount */
            money_price_amount?: string | null;
            /** Credit Redemption Price */
            credit_redemption_price?: number | null;
            /**
             * Is Available
             * @default true
             */
            is_available: boolean;
        };
        /** PublicHighlight */
        PublicHighlight: {
            /** Id */
            id: string;
            /** Surface */
            surface: string;
            /** Icon */
            icon?: string | null;
            /** Eyebrow */
            eyebrow?: string | null;
            /** Title */
            title: string;
            /** Subtitle */
            subtitle?: string | null;
            cta?: components["schemas"]["PublicCta"] | null;
            /**
             * Animation
             * @default fade_in
             */
            animation: string;
            /**
             * Color Scheme
             * @default brand
             */
            color_scheme: string;
        };
        /** PublicInclusion */
        PublicInclusion: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
        };
        /**
         * PublicLegalCoupon
         * @description Definición vigente de un cupón GENERAL, para generar sus cláusulas.
         */
        PublicLegalCoupon: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Discount Amount */
            discount_amount: string;
            /** Minimum Order Amount */
            minimum_order_amount: string;
            /** Valid From */
            valid_from?: string | null;
            /** Valid Until */
            valid_until?: string | null;
        };
        /**
         * PublicLegalTermsRead
         * @description Datos para armar el documento legal autogenerado del sitio (/terminos).
         */
        PublicLegalTermsRead: {
            /** Trade Name */
            trade_name: string;
            /** Legal Name */
            legal_name?: string | null;
            /** Main Address */
            main_address?: string | null;
            /** Email */
            email?: string | null;
            /** Currency Code */
            currency_code: string;
            /** Phones */
            phones?: components["schemas"]["PublicBusinessPhone"][];
            /** Coupons */
            coupons?: components["schemas"]["PublicLegalCoupon"][];
            /** Terms Extra */
            terms_extra?: string | null;
            /** Privacy Extra */
            privacy_extra?: string | null;
            /**
             * Generated At
             * Format: date-time
             */
            generated_at: string;
        };
        /** PublicMenuCategory */
        PublicMenuCategory: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Products */
            products: components["schemas"]["PublicProduct"][];
        };
        /** PublicModifierGroup */
        PublicModifierGroup: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Selection Type */
            selection_type: string;
            /** Is Required */
            is_required: boolean;
            /** Min Selections */
            min_selections: number;
            /** Max Selections */
            max_selections?: number | null;
            /** Options */
            options: components["schemas"]["PublicModifierOption"][];
        };
        /** PublicModifierOption */
        PublicModifierOption: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Price Adjustment */
            price_adjustment: string;
        };
        /** PublicProduct */
        PublicProduct: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Money Price Amount */
            money_price_amount?: string | null;
            /** Is Money Purchase Available */
            is_money_purchase_available: boolean;
            /** Credits Awarded Per Unit */
            credits_awarded_per_unit: number;
            /** Credit Redemption Price */
            credit_redemption_price?: number | null;
            /** Is Featured */
            is_featured: boolean;
            /** Max Units Per Order */
            max_units_per_order?: number | null;
            /** Image File Ids */
            image_file_ids: string[];
            /** Inclusions */
            inclusions: components["schemas"]["PublicInclusion"][];
            /** Modifier Groups */
            modifier_groups: components["schemas"]["PublicModifierGroup"][];
        };
        /** PublicShippingQuoteRequest */
        PublicShippingQuoteRequest: {
            /** Subtotal */
            subtotal: number | string;
            location?: components["schemas"]["GeoPoint"] | null;
        };
        /** PublicShippingQuoteResult */
        PublicShippingQuoteResult: {
            /** Status */
            status: string;
            /** Zone Name */
            zone_name?: string | null;
            /** Amount */
            amount?: string | null;
            /**
             * Is Free Shipping
             * @default false
             */
            is_free_shipping: boolean;
            /** Estimated Minutes */
            estimated_minutes?: number | null;
        };
        /** PublicSiteMeta */
        PublicSiteMeta: {
            /** Title */
            title?: string | null;
            /** Description */
            description?: string | null;
            /** Favicon File Id */
            favicon_file_id?: string | null;
            /** Social Image File Id */
            social_image_file_id?: string | null;
        };
        /** PublicSocialLink */
        PublicSocialLink: {
            /** Network */
            network: string;
            /** Url */
            url: string;
        };
        /** PublicStorefrontSite */
        PublicStorefrontSite: {
            /**
             * Enabled
             * @default true
             */
            enabled: boolean;
            /** Maintenance Message */
            maintenance_message?: string | null;
            meta?: components["schemas"]["PublicSiteMeta"];
            /** Theme Tokens */
            theme_tokens?: {
                [key: string]: unknown;
            };
            carousel?: components["schemas"]["PublicCarousel"];
            /** Heros */
            heros?: components["schemas"]["PublicHero"][];
            footer?: components["schemas"]["PublicFooter"];
        };
        /** ReadinessRead */
        ReadinessRead: {
            /**
             * Status
             * @constant
             */
            status: "ok";
            /** Checks */
            checks: {
                [key: string]: boolean;
            };
        };
        /** RefundAllocationItem */
        RefundAllocationItem: {
            /**
             * Order Line Id
             * Format: uuid
             */
            order_line_id: string;
            /** Refunded Quantity */
            refunded_quantity: number;
            /** Money Refunded Amount */
            money_refunded_amount: number | string;
            /** Reason */
            reason?: string | null;
        };
        /** RefundCreate */
        RefundCreate: {
            /** Amount */
            amount: number | string;
            /** Reason */
            reason: string;
            /** Allocations */
            allocations?: components["schemas"]["RefundAllocationItem"][];
            /** Transaction Reference */
            transaction_reference?: string | null;
            /** Bank Name */
            bank_name?: string | null;
        };
        /** RefundRead */
        RefundRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Payment Id
             * Format: uuid
             */
            payment_id: string;
            /** Amount */
            amount: string;
            /** Reason */
            reason: string;
            /** Status */
            status: string;
            /** Processed At */
            processed_at?: string | null;
        };
        /** RegisterCompleteRequest */
        RegisterCompleteRequest: {
            /** First Name */
            first_name: string;
            /** Last Name */
            last_name: string;
            /** Token */
            token: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /** RegisterRequest */
        RegisterRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /**
         * RelationOptionsSource
         * @description Origen declarado del universo de opciones de un editor relacional.
         */
        RelationOptionsSource: {
            type: components["schemas"]["OptionsSourceType"];
            /** Url */
            url: string;
            /** Value Field */
            value_field: string;
            /** Label Field */
            label_field: string;
        };
        /** ResetPasswordRequest */
        ResetPasswordRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Token */
            token: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /** ResourceActionCapability */
        ResourceActionCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
            scope: components["schemas"]["ActionScope"];
            /** Danger */
            danger: boolean;
            request?: components["schemas"]["ActionRequestSpec"] | null;
            input_schema?: components["schemas"]["ActionInputSchema"] | null;
            confirmation?: components["schemas"]["ActionConfirmation"] | null;
            /** @default refresh */
            success_behavior: components["schemas"]["ActionSuccessBehavior"];
            visible_when?: components["schemas"]["ActionCondition"] | null;
            enabled_when?: components["schemas"]["ActionCondition"] | null;
        };
        /** ResourceCapability */
        ResourceCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Api Path */
            api_path: string;
            view: components["schemas"]["ResourceView"];
            item_reference?: components["schemas"]["ItemReference"] | null;
            detail?: components["schemas"]["ResourceDetailCapability"] | null;
            file_download?: components["schemas"]["ResourceFileDownloadCapability"] | null;
            list?: components["schemas"]["ResourceListCapability"] | null;
            forms?: components["schemas"]["ResourceFormsCapability"] | null;
            /**
             * Actions
             * @default []
             */
            actions: components["schemas"]["ResourceActionCapability"][];
            /**
             * Relations
             * @default []
             */
            relations: components["schemas"]["ResourceRelationCapability"][];
            /**
             * Related Lists
             * @default []
             */
            related_lists: components["schemas"]["ResourceRelatedListCapability"][];
        };
        /**
         * ResourceCatalogResponse
         * @description Respuesta de ``GET /api/v1/resources``: catálogo completo de navegación.
         *
         *     - ``resources``: capabilities de los recursos tabulares/catálogo visibles para
         *       el usuario (mismo contenido que antes del envelope).
         *     - ``navigation_modules``: módulos ESPECIALIZADOS (pantallas propias como el
         *       editor del sitio o el POS) proyectados por permisos — solo aparecen los
         *       módulos donde el usuario tiene ALGUNO de sus ``required_permissions``.
         */
        ResourceCatalogResponse: {
            /** Resources */
            resources: components["schemas"]["ResourceCapability"][];
            /**
             * Navigation Modules
             * @default []
             */
            navigation_modules: components["schemas"]["NavigationModule"][];
        };
        /**
         * ResourceDetailCapability
         * @description Lectura individual declarada de un recurso (precarga de formularios).
         */
        ResourceDetailCapability: {
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
        };
        /** ResourceFieldCapability */
        ResourceFieldCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            type: components["schemas"]["FieldValueType"];
            /** Visible In List */
            visible_in_list: boolean;
            /** Sortable */
            sortable: boolean;
            /** Searchable */
            searchable: boolean;
            /** Filter Operators */
            filter_operators: components["schemas"]["FilterOperator"][];
        };
        /**
         * ResourceFileDownloadCapability
         * @description Descarga de contenido binario de un item (navegación de archivo, no mutación).
         *
         *     Genérico: cualquier recurso con contenido descargable la declara. Se proyecta solo
         *     si el actor tiene el permiso de descarga (distinto del de lectura de metadata). El
         *     backend revalida permiso y visibilidad y entrega el binario con cabeceras seguras.
         */
        ResourceFileDownloadCapability: {
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
        };
        /**
         * ResourceFileFieldCapability
         * @description Campo de archivo de un formulario multipart (genérico, sin semántica de dominio).
         *
         *     El frontend usa ``accepted_mime_types`` y ``max_size_bytes`` solo como guía de UI; el
         *     backend revalida tamaño y tipo en cada carga.
         */
        ResourceFileFieldCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Accepted Mime Types */
            accepted_mime_types: string[];
            /** Max Size Bytes */
            max_size_bytes: number;
            /** Required */
            required: boolean;
        };
        /** ResourceFilterOption */
        ResourceFilterOption: {
            /** Value */
            value: string;
            /** Label */
            label: string;
        };
        /** ResourceFormCapability */
        ResourceFormCapability: {
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
            /** Fields */
            fields: components["schemas"]["ResourceFormFieldCapability"][];
            /** @default json */
            transport: components["schemas"]["FormTransport"];
            file_field?: components["schemas"]["ResourceFileFieldCapability"] | null;
        };
        /** ResourceFormFieldCapability */
        ResourceFormFieldCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            type: components["schemas"]["FieldValueType"];
            /** Required */
            required: boolean;
            /**
             * Editable
             * @default true
             */
            editable: boolean;
            widget?: components["schemas"]["WidgetType"] | null;
            /** Options */
            options?: components["schemas"]["ResourceFilterOption"][] | null;
        };
        /** ResourceFormsCapability */
        ResourceFormsCapability: {
            create?: components["schemas"]["ResourceFormCapability"] | null;
            update?: components["schemas"]["ResourceFormCapability"] | null;
        };
        /** ResourceListCapability */
        ResourceListCapability: {
            /** Fields */
            fields: components["schemas"]["ResourceFieldCapability"][];
            /**
             * Filterable Fields
             * @default []
             */
            filterable_fields: components["schemas"]["FilterableFieldCapability"][];
            pagination: components["schemas"]["PaginationCapability"];
            search: components["schemas"]["SearchCapability"];
            sort: components["schemas"]["SortCapability"];
        };
        /**
         * ResourceRelatedListCapability
         * @description Lista RELACIONADA navegable por item (p. ej. signos vitales de una consulta).
         *
         *     Es navegación de solo lectura, no un editor: el frontend enlaza a la lista del
         *     recurso destino con ``parameter_name=<valor de la referencia del item>`` (el
         *     filtro EQ ya publicado por ``filterable_fields`` del destino). Se proyecta solo
         *     si el actor tiene el permiso de LECTURA del recurso destino.
         */
        ResourceRelatedListCapability: {
            /** Resource */
            resource: string;
            /** Label */
            label: string;
            /** Parameter Name */
            parameter_name: string;
        };
        /**
         * ResourceRelationCapability
         * @description Editor relacional declarado por el backend (p. ej. roles de un usuario).
         *
         *     El frontend no infiere rutas ni cardinalidad desde nombres: consume estas URLs
         *     y campos. ``selection_url`` y ``mutation_url`` son plantillas con ``{id}`` del
         *     recurso dueño. ``request_field`` es el campo del cuerpo que transporta la lista
         *     completa de valores objetivo (reemplazo atómico).
         */
        ResourceRelationCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            /** Required */
            required: boolean;
            /** Editable */
            editable: boolean;
            /** Selection Url */
            selection_url: string;
            /** Selection Field */
            selection_field?: string | null;
            mutation_method: components["schemas"]["HttpMethod"];
            /** Mutation Url */
            mutation_url: string;
            /** Request Field */
            request_field: string;
            options: components["schemas"]["RelationOptionsSource"];
        };
        /**
         * ResourceView
         * @enum {string}
         */
        ResourceView: "table" | "grouped_catalog";
        /** RoleCreate */
        RoleCreate: {
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Permissions */
            permissions?: string[];
        };
        /**
         * RoleDetailRead
         * @description Detalle de rol incluyendo los permisos asignados.
         */
        RoleDetailRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
            /** Permissions */
            permissions: string[];
        };
        /**
         * RoleListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         *
         *     Redeclara los campos visibles en lista con metadata UI explícita. ``id`` se
         *     hereda sin ``ui`` y por tanto no se proyecta como columna por defecto.
         */
        RoleListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Activo */
            is_active: boolean;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * RolePermissionsRead
         * @description Selección actual de permisos de un rol (lectura para el editor relacional).
         */
        RolePermissionsRead: {
            /** Permissions */
            permissions: string[];
        };
        /**
         * RolePermissionsReplace
         * @description Reemplazo completo de permisos asignados a un rol (PUT).
         */
        RolePermissionsReplace: {
            /** Permissions */
            permissions: string[];
        };
        /** RoleRead */
        RoleRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /** RoleUpdate */
        RoleUpdate: {
            /** Nombre */
            name?: string | null;
            /** Descripción */
            description?: string | null;
            /** Activo */
            is_active?: boolean | null;
        };
        /** SalesByHourItem */
        SalesByHourItem: {
            /** Hour */
            hour: number;
            /** Orders Count */
            orders_count: number;
            /** Money Total */
            money_total: string;
        };
        /** SalesByHourReport */
        SalesByHourReport: {
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /**
             * Date To
             * Format: date
             */
            date_to: string;
            /** Timezone */
            timezone: string;
            /** Items */
            items: components["schemas"]["SalesByHourItem"][];
        };
        /** SearchCapability */
        SearchCapability: {
            /** Enabled */
            enabled: boolean;
            /** Min Length */
            min_length?: number | null;
            /** Max Length */
            max_length?: number | null;
        };
        /**
         * SendTestEmailRequest
         * @description Cuerpo de la acción de correo de prueba (destinatario opcional: default el
         *     administrador que la ejecuta).
         */
        SendTestEmailRequest: {
            /** Destinatario (opcional) */
            recipient?: string | null;
        };
        /** SessionUser */
        SessionUser: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Permissions */
            permissions?: string[];
        };
        /** SettingsPatch */
        SettingsPatch: {
            /** Site Title */
            site_title?: string | null;
            /** Site Description */
            site_description?: string | null;
            /** Favicon File Id */
            favicon_file_id?: string | null;
            /** Social Image File Id */
            social_image_file_id?: string | null;
            /** Storefront Enabled */
            storefront_enabled?: boolean | null;
            /** Maintenance Message */
            maintenance_message?: string | null;
            /** Hero Autoplay */
            hero_autoplay?: boolean | null;
            /** Hero Interval Seconds */
            hero_interval_seconds?: number | null;
            /** Hero Transition */
            hero_transition?: ("slide" | "fade") | null;
            /** Hero Show Arrows */
            hero_show_arrows?: boolean | null;
            /** Hero Show Dots */
            hero_show_dots?: boolean | null;
        };
        /** SettingsRead */
        SettingsRead: {
            /** Storefront Enabled */
            storefront_enabled: boolean;
            /** Maintenance Message */
            maintenance_message?: string | null;
            /** Site Title */
            site_title?: string | null;
            /** Site Description */
            site_description?: string | null;
            /** Favicon File Id */
            favicon_file_id?: string | null;
            /** Social Image File Id */
            social_image_file_id?: string | null;
            /** Theme Preset */
            theme_preset: string;
            /** Theme Accent */
            theme_accent?: string | null;
            /** Hero Autoplay */
            hero_autoplay: boolean;
            /** Hero Interval Seconds */
            hero_interval_seconds: number;
            /** Hero Transition */
            hero_transition: string;
            /** Hero Show Arrows */
            hero_show_arrows: boolean;
            /** Hero Show Dots */
            hero_show_dots: boolean;
        };
        /**
         * SetupChecklistItemRead
         * @description Ítem del checklist de puesta en marcha (estado derivado).
         */
        SetupChecklistItemRead: {
            /** Key */
            key: string;
            /** Title */
            title: string;
            /**
             * Status
             * @enum {string}
             */
            status: "complete" | "pending" | "not_applicable";
            /** Detail */
            detail: string;
        };
        /**
         * SetupChecklistRead
         * @description Checklist derivado + si el administrador lo descartó.
         */
        SetupChecklistRead: {
            /** Items */
            items: components["schemas"]["SetupChecklistItemRead"][];
            /** Dismissed */
            dismissed: boolean;
            /** Pending Count */
            pending_count: number;
            /** Environment */
            environment: string;
        };
        /** ShippingRateCreate */
        ShippingRateCreate: {
            /** Name */
            name: string;
            /** Base Fee */
            base_fee: number | string;
            /** Minimum Order Amount */
            minimum_order_amount?: number | string | null;
            /** Free Shipping From Amount */
            free_shipping_from_amount?: number | string | null;
            /** Estimated Minutes */
            estimated_minutes?: number | null;
            /**
             * Priority
             * @default 0
             */
            priority: number;
        };
        /** ShippingRateRead */
        ShippingRateRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Base Fee */
            base_fee: string;
            /** Minimum Order Amount */
            minimum_order_amount?: string | null;
            /** Free Shipping From Amount */
            free_shipping_from_amount?: string | null;
            /** Estimated Minutes */
            estimated_minutes?: number | null;
            /** Priority */
            priority: number;
            /** Is Active */
            is_active: boolean;
        };
        /** ShippingRateUpdate */
        ShippingRateUpdate: {
            /** Name */
            name?: string | null;
            /** Base Fee */
            base_fee?: number | string | null;
            /** Minimum Order Amount */
            minimum_order_amount?: number | string | null;
            /** Free Shipping From Amount */
            free_shipping_from_amount?: number | string | null;
            /** Estimated Minutes */
            estimated_minutes?: number | null;
            /** Priority */
            priority?: number | null;
            /** Is Active */
            is_active?: boolean | null;
        };
        /** SocialLink */
        SocialLink: {
            /**
             * Network
             * @enum {string}
             */
            network: "facebook" | "instagram" | "tiktok" | "whatsapp" | "youtube" | "x";
            /** Url */
            url: string;
        };
        /** SortCapability */
        SortCapability: {
            /** Default Sort */
            default_sort?: string | null;
            /** Fixed Server Order */
            fixed_server_order: boolean;
            /** Max Terms */
            max_terms: number;
            /** Max Length */
            max_length: number;
        };
        /**
         * SortOrderReplace
         * @description Lista COMPLETA de IDs de la colección, en el nuevo orden.
         */
        SortOrderReplace: {
            /** Ids */
            ids: string[];
        };
        /** SpecialDateCreate */
        SpecialDateCreate: {
            /**
             * Calendar Date
             * Format: date
             */
            calendar_date: string;
            /**
             * Is Closed
             * @default false
             */
            is_closed: boolean;
            /** Reason */
            reason?: string | null;
            /** Slots */
            slots?: components["schemas"]["SpecialDateSlotInput"][];
        };
        /** SpecialDateRead */
        SpecialDateRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Calendar Date
             * Format: date
             */
            calendar_date: string;
            /** Is Closed */
            is_closed: boolean;
            /** Reason */
            reason?: string | null;
            /** Slots */
            slots?: components["schemas"]["SpecialDateSlotRead"][];
        };
        /** SpecialDateSlotInput */
        SpecialDateSlotInput: {
            /**
             * Slot Number
             * @default 1
             */
            slot_number: number;
            /**
             * Opens At
             * Format: time
             */
            opens_at: string;
            /**
             * Closes At
             * Format: time
             */
            closes_at: string;
        };
        /** SpecialDateSlotRead */
        SpecialDateSlotRead: {
            /** Slot Number */
            slot_number: number;
            /**
             * Opens At
             * Format: time
             */
            opens_at: string;
            /**
             * Closes At
             * Format: time
             */
            closes_at: string;
        };
        /** SpecialDateUpdate */
        SpecialDateUpdate: {
            /** Is Closed */
            is_closed?: boolean | null;
            /** Reason */
            reason?: string | null;
            /** Slots */
            slots?: components["schemas"]["SpecialDateSlotInput"][] | null;
        };
        /** StaffProfileRead */
        StaffProfileRead: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /** Display Name */
            display_name: string;
            /** Contact Phone */
            contact_phone?: string | null;
            /** Public Contact Phone */
            public_contact_phone?: string | null;
            /** Photo File Id */
            photo_file_id?: string | null;
            /** Can Deliver */
            can_deliver: boolean;
            /** Is Delivery Available */
            is_delivery_available: boolean;
            /** Courier Public Note */
            courier_public_note?: string | null;
            /** Is Active */
            is_active: boolean;
        };
        /** StaffProfileUpsert */
        StaffProfileUpsert: {
            /** Display Name */
            display_name: string;
            /** Contact Phone */
            contact_phone?: string | null;
            /** Public Contact Phone */
            public_contact_phone?: string | null;
            /** Photo File Id */
            photo_file_id?: string | null;
            /**
             * Can Deliver
             * @default false
             */
            can_deliver: boolean;
            /** Courier Public Note */
            courier_public_note?: string | null;
            /**
             * Is Active
             * @default true
             */
            is_active: boolean;
        };
        /**
         * StoredFileRead
         * @description Metadatos públicos de un archivo almacenado (sin contenido).
         */
        StoredFileRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Original Filename */
            original_filename: string;
            /** Mime Type */
            mime_type: string;
            /** Byte Size */
            byte_size: number;
            /** Sha256 */
            sha256: string;
            /** Kind */
            kind: string;
            /** Is Active */
            is_active: boolean;
            /** Uploaded By */
            uploaded_by?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * StorefrontConfig
         * @description Config completa del editor en UNA llamada (las 4 pestañas).
         */
        StorefrontConfig: {
            settings: components["schemas"]["SettingsRead"];
            footer: components["schemas"]["FooterRead"];
            /** Heros */
            heros?: components["schemas"]["HeroRead"][];
            /** Highlights */
            highlights?: components["schemas"]["HighlightRead"][];
            /** Theme Presets */
            theme_presets?: components["schemas"]["ThemePresetRead"][];
            /** Active Theme Tokens */
            active_theme_tokens?: {
                [key: string]: unknown;
            };
        };
        /**
         * SystemSettingsListItem
         * @description Versión de listado del singleton (una fila).
         */
        SystemSettingsListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Institución */
            institution_name?: string | null;
            /** Registro público */
            public_registration_enabled: boolean;
            /** Dominio */
            app_base_url?: string | null;
            /** Actualizado */
            updated_at?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * SystemSettingsRead
         * @description Estado completo y SEGURO de la configuración del sistema.
         */
        SystemSettingsRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Public Registration Enabled */
            public_registration_enabled: boolean;
            /** Registration Allowed By Deployment */
            registration_allowed_by_deployment: boolean;
            /** Public Registration Effective */
            public_registration_effective: boolean;
            /** App Base Url */
            app_base_url?: string | null;
            /** App Base Url Verified At */
            app_base_url_verified_at?: string | null;
            /** Institution Name */
            institution_name?: string | null;
            /** Login Verification Mode */
            login_verification_mode: string;
            /** Google Login Enabled */
            google_login_enabled: boolean;
            /** Google Auth Client Id */
            google_auth_client_id?: string | null;
            /** Google Auth Client Secret Configured */
            google_auth_client_secret_configured: boolean;
            /** Password Reset Enabled */
            password_reset_enabled: boolean;
            /** Customer Session Days */
            customer_session_days?: number | null;
            /** Staff Session Minutes */
            staff_session_minutes?: number | null;
            /** Customer Session Days Effective */
            customer_session_days_effective: number;
            /** Staff Session Minutes Effective */
            staff_session_minutes_effective: number;
            /** Email Mode */
            email_mode: string;
            /** Email From Address */
            email_from_address?: string | null;
            /** Email From Name */
            email_from_name?: string | null;
            /** Email Smtp Host */
            email_smtp_host?: string | null;
            /** Email Smtp Port */
            email_smtp_port?: number | null;
            /** Email Smtp Username */
            email_smtp_username?: string | null;
            /** Email Smtp Tls */
            email_smtp_tls: boolean;
            /** Email Smtp Ssl */
            email_smtp_ssl: boolean;
            /** Email Smtp Password Configured */
            email_smtp_password_configured: boolean;
            /** Email Resend Api Key Configured */
            email_resend_api_key_configured: boolean;
            /** Email Last Test At */
            email_last_test_at?: string | null;
            /** Email Last Test Status */
            email_last_test_status?: string | null;
            /** Email Last Test Error */
            email_last_test_error?: string | null;
            /** Email Transport Reason */
            email_transport_reason?: string | null;
            /** Environment */
            environment: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
            /** Updated By */
            updated_by?: string | null;
        };
        /**
         * SystemSettingsUpdate
         * @description Campos EDITABLES de la política del sistema.
         */
        SystemSettingsUpdate: {
            /**
             * Registro público
             * @description Permitir el auto-registro por correo. Sólo tiene efecto si el despliegue lo permite (candado del entorno).
             */
            public_registration_enabled?: boolean | null;
            /**
             * Nombre de la institución
             * @description Nombre de la institución para membretes y encabezados.
             */
            institution_name?: string | null;
            /**
             * Verificación de inicio de sesión
             * @description Segundo paso por correo en cada login: código de un solo uso o enlace. Requiere transporte de correo utilizable. Los administradores con cobertura completa quedan exentos siempre (garantía anti-bloqueo).
             */
            login_verification_mode?: ("disabled" | "code" | "link") | null;
            /**
             * Sesión del cliente (días)
             * @description Cuánto dura la sesión de un CLIENTE (usuario sin roles). La renovación deslizante la extiende con la actividad: un cliente que compra una vez al mes no vuelve a iniciar sesión. Vacío = default del despliegue.
             */
            customer_session_days?: number | null;
            /**
             * Sesión del personal (minutos)
             * @description Cuánto dura la sesión de un usuario CON roles (panel/admin) sin actividad; con actividad se renueva sola. Vacío = default del despliegue.
             */
            staff_session_minutes?: number | null;
            /**
             * Recuperación de contraseña
             * @description Permitir restablecer contraseña por correo. AVISO: apagarla con el registro cerrado y un solo administrador puede dejar la instalación sin acceso (la salida es el seed del servidor).
             */
            password_reset_enabled?: boolean | null;
            /**
             * Transporte de correo
             * @description environment: SMTP del despliegue (Mailpit en desarrollo); smtp/resend: credenciales guardadas aquí (cifradas).
             */
            email_mode?: ("environment" | "smtp" | "resend") | null;
            /**
             * Remitente
             * @description Correo remitente (modos smtp/resend).
             */
            email_from_address?: string | null;
            /** Nombre del remitente */
            email_from_name?: string | null;
            /** Servidor SMTP */
            email_smtp_host?: string | null;
            /** Puerto SMTP */
            email_smtp_port?: number | null;
            /** Usuario SMTP */
            email_smtp_username?: string | null;
            /** STARTTLS */
            email_smtp_tls?: boolean | null;
            /** SSL directo */
            email_smtp_ssl?: boolean | null;
            /**
             * Inicio de sesión con Google
             * @description Muestra 'Continuar con Google' en el login. Requiere client ID y secret configurados. El alta de cuentas nuevas exige además el registro público habilitado.
             */
            google_login_enabled?: boolean | null;
            /** Client ID de Google (login) */
            google_auth_client_id?: string | null;
            /**
             * Client secret de Google (write-only)
             * @description Se guarda cifrado; nunca vuelve a mostrarse.
             */
            google_auth_client_secret?: string | null;
            /**
             * Contraseña SMTP (write-only)
             * @description Se guarda cifrada; nunca vuelve a mostrarse.
             */
            email_smtp_password?: string | null;
            /**
             * API key de Resend (write-only)
             * @description Se guarda cifrada; nunca vuelve a mostrarse.
             */
            email_resend_api_key?: string | null;
        };
        /** ThemePatch */
        ThemePatch: {
            /** Theme Preset */
            theme_preset?: string | null;
            /** Theme Accent */
            theme_accent?: string | null;
        };
        /** ThemePresetRead */
        ThemePresetRead: {
            /** Name */
            name: string;
            /** Tokens */
            tokens: {
                [key: string]: unknown;
            };
            /** Is Default */
            is_default: boolean;
        };
        /** TicketBusiness */
        TicketBusiness: {
            /** Trade Name */
            trade_name: string;
            /** Slogan */
            slogan?: string | null;
            /** Logo File Id */
            logo_file_id?: string | null;
            /** Footer Text */
            footer_text?: string | null;
        };
        /** TicketCustomer */
        TicketCustomer: {
            /** Name */
            name?: string | null;
            /** Phone */
            phone?: string | null;
        };
        /** TicketDelivery */
        TicketDelivery: {
            /** Street */
            street: string;
            /** External Number */
            external_number?: string | null;
            /** Internal Number */
            internal_number?: string | null;
            /** Neighborhood */
            neighborhood?: string | null;
            /** City */
            city?: string | null;
            /** References */
            references?: string | null;
        };
        /** TicketLine */
        TicketLine: {
            /** Name */
            name: string;
            /** Quantity */
            quantity: number;
            /** Purchase Mode */
            purchase_mode: string;
            /** Unit Price */
            unit_price: string;
            /** Line Total */
            line_total: string;
            /** Customer Note */
            customer_note?: string | null;
            /** Credits Redeemed */
            credits_redeemed: number;
            /** Modifiers */
            modifiers?: components["schemas"]["TicketLineModifier"][];
        };
        /** TicketLineModifier */
        TicketLineModifier: {
            /** Group */
            group: string;
            /** Option */
            option: string;
            /** Quantity */
            quantity: number;
            /** Total */
            total: string;
        };
        /** TicketPayment */
        TicketPayment: {
            /** Method */
            method: string;
            /** Status */
            status: string;
            /** Expected Amount */
            expected_amount: string;
            /** Received Amount */
            received_amount?: string | null;
            /** Change Requested For Amount */
            change_requested_for_amount?: string | null;
            /** Change Amount */
            change_amount: string;
        };
        /** TicketPrintCreate */
        TicketPrintCreate: {
            /**
             * Print Type
             * @enum {string}
             */
            print_type: "customer_receipt" | "kitchen_ticket" | "delivery_ticket" | "counter_ticket";
            /** Printer Name */
            printer_name?: string | null;
            /**
             * Copy Number
             * @default 1
             */
            copy_number: number;
        };
        /** TicketPrintRead */
        TicketPrintRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /** Print Type */
            print_type: string;
            /** Printer Name */
            printer_name?: string | null;
            /** Printed By */
            printed_by?: string | null;
            /** Copy Number */
            copy_number: number;
            /**
             * Printed At
             * Format: date-time
             */
            printed_at: string;
        };
        /** TicketRead */
        TicketRead: {
            business: components["schemas"]["TicketBusiness"];
            /** Public Code */
            public_code: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Source */
            source: string;
            /** Fulfillment Type */
            fulfillment_type: string;
            /** Status */
            status: string;
            /** Status Label */
            status_label: string;
            /** Attended By */
            attended_by?: string | null;
            customer: components["schemas"]["TicketCustomer"];
            delivery?: components["schemas"]["TicketDelivery"] | null;
            /** Lines */
            lines: components["schemas"]["TicketLine"][];
            totals: components["schemas"]["TicketTotals"];
            /** Payments */
            payments?: components["schemas"]["TicketPayment"][];
        };
        /** TicketTotals */
        TicketTotals: {
            /** Items Subtotal */
            items_subtotal: string;
            /** Discounts */
            discounts: string;
            /** Discount Code */
            discount_code?: string | null;
            /** Shipping */
            shipping?: string | null;
            /** Total */
            total?: string | null;
            /** Credits Earned */
            credits_earned: number;
            /** Credits Redeemed */
            credits_redeemed: number;
        };
        /** TopProductItem */
        TopProductItem: {
            /** Product Name */
            product_name: string;
            /** Units */
            units: number;
            /** Money Total */
            money_total: string;
            /** Credits Redeemed */
            credits_redeemed: number;
        };
        /** TopProductsReport */
        TopProductsReport: {
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /**
             * Date To
             * Format: date
             */
            date_to: string;
            /** Items */
            items: components["schemas"]["TopProductItem"][];
        };
        /** TrackingToggleRequest */
        TrackingToggleRequest: {
            /** Sharing Enabled */
            sharing_enabled: boolean;
        };
        /** UnlockAccountRequest */
        UnlockAccountRequest: {
            /** Token */
            token: string;
        };
        /** UserAddressCreate */
        UserAddressCreate: {
            /** Label */
            label?: string | null;
            /** Street */
            street: string;
            /** External Number */
            external_number?: string | null;
            /** Internal Number */
            internal_number?: string | null;
            /** Neighborhood */
            neighborhood?: string | null;
            /** City */
            city?: string | null;
            /** Postal Code */
            postal_code?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /**
             * Is Default
             * @default false
             */
            is_default: boolean;
        };
        /** UserAddressRead */
        UserAddressRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Label */
            label?: string | null;
            /** Street */
            street: string;
            /** External Number */
            external_number?: string | null;
            /** Internal Number */
            internal_number?: string | null;
            /** Neighborhood */
            neighborhood?: string | null;
            /** City */
            city?: string | null;
            /** Postal Code */
            postal_code?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Is Default */
            is_default: boolean;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** UserAddressUpdate */
        UserAddressUpdate: {
            /** Label */
            label?: string | null;
            /** Street */
            street?: string | null;
            /** External Number */
            external_number?: string | null;
            /** Internal Number */
            internal_number?: string | null;
            /** Neighborhood */
            neighborhood?: string | null;
            /** City */
            city?: string | null;
            /** Postal Code */
            postal_code?: string | null;
            /** References */
            references?: string | null;
            location?: components["schemas"]["GeoPoint"] | null;
            /** Is Default */
            is_default?: boolean | null;
        };
        /**
         * UserAdminCreate
         * @description Creación administrativa de un usuario.
         */
        UserAdminCreate: {
            /** Nombre */
            name: string;
            /** Apellido */
            last_name: string;
            /**
             * Correo
             * Format: email
             */
            email: string;
            /**
             * Contraseña
             * Format: password
             */
            password: string;
            /**
             * Confirmar contraseña
             * Format: password
             */
            confirm_password: string;
            /**
             * Activo
             * @default true
             */
            is_active: boolean;
        };
        /**
         * UserAdminListItem
         * @description Versión reducida para listados administrativos de usuarios.
         */
        UserAdminListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre */
            name: string;
            /** Apellido */
            last_name: string;
            /**
             * Correo
             * Format: email
             */
            email: string;
            /** Activo */
            is_active: boolean;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * UserAdminRead
         * @description Representación administrativa completa de un usuario.
         */
        UserAdminRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * UserAdminUpdate
         * @description Actualización parcial administrativa de un usuario (PATCH).
         */
        UserAdminUpdate: {
            /** Nombre */
            name?: string | null;
            /** Apellido */
            last_name?: string | null;
            /** Correo */
            email?: string | null;
            /** Activo */
            is_active?: boolean | null;
        };
        /**
         * UserPasswordChangeRequest
         * @description Cambio de contraseña solicitado por el propio usuario.
         */
        UserPasswordChangeRequest: {
            /**
             * Current Password
             * Format: password
             */
            current_password: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /**
         * UserProfileRead
         * @description Datos propios visibles para el usuario autenticado.
         */
        UserProfileRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * UserProfileUpdate
         * @description Campos que el usuario puede editar sobre su propio perfil.
         */
        UserProfileUpdate: {
            /** Name */
            name?: string | null;
            /** Last Name */
            last_name?: string | null;
            /** Email */
            email?: string | null;
        };
        /**
         * UserRolesReplace
         * @description Reemplazo completo de los roles asignados a un usuario (PUT).
         */
        UserRolesReplace: {
            /** Role Ids */
            role_ids: string[];
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
        /**
         * VerifyDomainRequest
         * @description Cuerpo de la verificación de dominio (sin valor: se deriva del Origin).
         */
        VerifyDomainRequest: {
            /**
             * Dominio base (opcional)
             * @description https://tu-dominio; vacío = el dominio por el que navegas ahora.
             */
            base_url?: string | null;
        };
        /** WeeklyHourRead */
        WeeklyHourRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Day Of Week */
            day_of_week: number;
            /** Slot Number */
            slot_number: number;
            /**
             * Opens At
             * Format: time
             */
            opens_at: string;
            /**
             * Closes At
             * Format: time
             */
            closes_at: string;
            /** Is Active */
            is_active: boolean;
        };
        /** WeeklyHourSlot */
        WeeklyHourSlot: {
            /**
             * Day Of Week
             * @description 0=lunes … 6=domingo.
             */
            day_of_week: number;
            /**
             * Slot Number
             * @default 1
             */
            slot_number: number;
            /**
             * Opens At
             * Format: time
             */
            opens_at: string;
            /**
             * Closes At
             * Format: time
             */
            closes_at: string;
        };
        /**
         * WeeklyHoursReplace
         * @description PUT del horario semanal completo: lo enviado sustituye TODO lo anterior.
         */
        WeeklyHoursReplace: {
            /** Slots */
            slots: components["schemas"]["WeeklyHourSlot"][];
        };
        /**
         * WidgetType
         * @enum {string}
         */
        WidgetType: "text" | "email" | "password" | "switch" | "textarea" | "multiselect" | "select" | "number" | "date" | "daterange" | "datetime" | "time";
        /** CourierAvailabilityUpdate */
        backend__app__schemas__delivery__CourierAvailabilityUpdate: {
            /** Is Available */
            is_available: boolean;
        };
        /** CourierAvailabilityUpdate */
        backend__app__schemas__profile__CourierAvailabilityUpdate: {
            /** Is Delivery Available */
            is_delivery_available?: boolean | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_api_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthRead"];
                };
            };
        };
    };
    readiness_api_ready_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadinessRead"];
                };
            };
        };
    };
    list_my_addresses_api_v1_users_me_addresses_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAddressRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_my_address_api_v1_users_me_addresses_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAddressCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAddressRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_my_address_api_v1_users_me_addresses__address_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                address_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_my_address_api_v1_users_me_addresses__address_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                address_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAddressUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAddressRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_audit_events_api_v1_audit_events_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                actor_user_id?: string | null;
                action?: string | null;
                entity_type?: string | null;
                entity_id?: string | null;
                id_in?: string[] | null;
                occurred_at_on?: string | null;
                occurred_at_before?: string | null;
                occurred_at_after?: string | null;
                occurred_at_from?: string | null;
                occurred_at_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_AuditEventListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_audit_event_api_v1_audit_events__event_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditEventRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_auth_policy_api_v1_auth_policy_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthPolicyRead"];
                };
            };
        };
    };
    read_current_user_api_v1_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_v1_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_login_api_v1_auth_login_verify_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginVerifyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    google_login_start_api_v1_auth_google_start_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    google_login_callback_api_v1_auth_google_callback_get: {
        parameters: {
            query?: {
                code?: string;
                state?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_api_v1_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_registration_api_v1_auth_register_request_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_registration_api_v1_auth_register_complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterCompleteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unlock_account_api_v1_auth_unlock_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnlockAccountRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_password_reset_api_v1_auth_password_forgot_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotPasswordRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_password_reset_api_v1_auth_password_reset_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_backup_settings_api_v1_backup_settings_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                id_in?: string[] | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_BackupSettingsListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_backup_settings_detail_api_v1_backup_settings__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_backup_settings_api_v1_backup_settings__item_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BackupSettingsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    generate_encryption_key_api_v1_backup_settings__item_id__generate_encryption_key_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    connect_drive_api_v1_backup_settings__item_id__connect_drive_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConnectDriveResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    google_drive_callback_api_v1_backups_google_drive_callback_get: {
        parameters: {
            query?: {
                code?: string | null;
                state?: string | null;
                error?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    disconnect_drive_api_v1_backup_settings__item_id__disconnect_drive_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_backup_now_api_v1_backup_settings__item_id__run_now_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupRunRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_backup_runs_api_v1_backup_runs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                status?: components["schemas"]["BackupRunStatus"] | null;
                trigger_kind?: components["schemas"]["BackupTriggerKind"] | null;
                id_in?: string[] | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_BackupRunListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_backup_run_api_v1_backup_runs__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupRunRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_drive_backup_files_api_v1_backups_drive_files_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DriveBackupFilesResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_drive_backup_file_api_v1_backups_drive_files__file_id__download_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_bootstrap_status_api_v1_bootstrap_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BootstrapStatusRead"];
                };
            };
        };
    };
    read_bootstrap_catalog_api_v1_bootstrap_catalog_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Bootstrap-Token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BootstrapCatalogRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    initialize_bootstrap_api_v1_bootstrap_initialize_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Bootstrap-Token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BootstrapInitializeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BootstrapInitializeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_profile_api_v1_business_profile_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_profile_api_v1_business_profile_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BusinessProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_settings_api_v1_business_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_settings_api_v1_business_settings_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BusinessSettingsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_phones_api_v1_business_phones_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessPhoneRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_phone_api_v1_business_phones_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BusinessPhoneCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessPhoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    deactivate_phone_api_v1_business_phones__phone_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                phone_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessPhoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_phone_api_v1_business_phones__phone_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                phone_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BusinessPhoneUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessPhoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_weekly_hours_api_v1_business_weekly_hours_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeeklyHourRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_weekly_hours_api_v1_business_weekly_hours_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WeeklyHoursReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeeklyHourRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_special_dates_api_v1_business_special_dates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpecialDateRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_special_date_api_v1_business_special_dates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SpecialDateCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpecialDateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_special_date_api_v1_business_special_dates__special_date_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                special_date_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_special_date_api_v1_business_special_dates__special_date_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                special_date_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SpecialDateUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpecialDateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_categories_api_v1_catalog_categories_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_CategoryListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_category_api_v1_catalog_categories_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_category_api_v1_catalog_categories__category_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_category_api_v1_catalog_categories__category_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sort_categories_api_v1_catalog_categories_sort_order_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SortOrderReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_products_api_v1_catalog_products_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                is_available?: boolean | null;
                is_featured?: boolean | null;
                category_id?: string | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ProductListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_product_api_v1_catalog_products_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_product_api_v1_catalog_products__product_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_product_api_v1_catalog_products__product_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sort_products_in_category_api_v1_catalog_categories__category_id__products_sort_order_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SortOrderReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    attach_product_image_api_v1_catalog_products__product_id__images_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductImageAttach"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductImageRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    detach_product_image_api_v1_catalog_products__product_id__images__image_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
                image_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sort_product_images_api_v1_catalog_products__product_id__images_sort_order_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SortOrderReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductImageRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_product_inclusions_api_v1_catalog_products__product_id__inclusions_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductInclusionsReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_modifier_groups_api_v1_catalog_modifier_groups_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                is_required?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ModifierGroupListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_modifier_group_api_v1_catalog_modifier_groups_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ModifierGroupCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModifierGroupRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_modifier_group_api_v1_catalog_modifier_groups__group_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModifierGroupRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_modifier_group_api_v1_catalog_modifier_groups__group_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ModifierGroupUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModifierGroupRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_modifier_option_api_v1_catalog_modifier_groups__group_id__options_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ModifierOptionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModifierOptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_modifier_option_api_v1_catalog_modifier_options__option_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                option_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ModifierOptionUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModifierOptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sort_modifier_options_api_v1_catalog_modifier_groups__group_id__options_sort_order_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SortOrderReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModifierOptionRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_product_modifier_groups_api_v1_catalog_products__product_id__modifier_groups_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductModifierGroupRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_product_modifier_groups_api_v1_catalog_products__product_id__modifier_groups_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductModifierGroupsReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductModifierGroupRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_available_orders_api_v1_courier_available_orders_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvailableDeliveryItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_active_deliveries_api_v1_courier_deliveries_mine_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyActiveDelivery"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_availability_api_v1_courier_availability_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["backend__app__schemas__delivery__CourierAvailabilityUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourierSummaryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    take_api_v1_courier_deliveries__order_delivery_id__take_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_delivery_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_api_v1_courier_deliveries__order_delivery_id__start_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_delivery_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_api_v1_courier_deliveries__order_delivery_id__complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_delivery_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompleteDeliveryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_summary_api_v1_courier_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourierSummaryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    toggle_tracking_api_v1_courier_tracking_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrackingToggleRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    push_location_api_v1_courier_tracking_location_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LocationReportRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    assign_manual_api_v1_deliveries__order_delivery_id__assign_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_delivery_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignCourierRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    deliveries_queue_api_v1_deliveries_queue_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvailableDeliveryItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_credits_api_v1_credits_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditTotalsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_movements_api_v1_credits_me_movements_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditMovementRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    user_credits_api_v1_credits_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditTotalsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    user_movements_api_v1_credits_users__user_id__movements_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditMovementRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    adjust_credits_api_v1_credits_adjustments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreditAdjustmentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditMovementRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    quote_discount_code_api_v1_discount_codes_quote_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscountQuoteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscountQuoteResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_discount_codes_api_v1_discount_codes_get: {
        parameters: {
            query?: {
                q?: string | null;
                is_active?: boolean | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscountCodeListItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_discount_code_api_v1_discount_codes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscountCodeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscountCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_discount_code_api_v1_discount_codes__code_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscountCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_discount_code_api_v1_discount_codes__code_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiscountCodeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscountCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_discount_code_redemptions_api_v1_discount_codes__code_id__redemptions_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                code_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscountRedemptionListItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_file_api_v1_files_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_file_api_v1_files_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoredFileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_file_details_api_v1_files__file_id__details_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoredFileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_file_api_v1_files__file_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_categories_api_v1_finances_categories_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                direction?: string | null;
                is_active?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_FinancialCategoryListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_category_api_v1_finances_categories_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FinancialCategoryCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialCategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_finance_category_api_v1_finances_categories__category_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialCategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_entries_api_v1_finances_entries_get: {
        parameters: {
            query?: {
                direction?: string | null;
                entry_type?: string | null;
                from?: string | null;
                to?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialEntryRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_entry_api_v1_finances_entries_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FinancialEntryCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialEntryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_financial_entry_api_v1_finances_entries__entry_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                entry_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FinancialEntryVoidRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialEntryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    attach_entry_evidence_api_v1_finances_entries__entry_id__attachments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                entry_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FinancialEntryAttachmentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialEntryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_summary_api_v1_finances_summary_get: {
        parameters: {
            query: {
                from: string;
                to: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BusinessSummaryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refund_credit_line_api_v1_orders__order_id__credit_refunds_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreditRefundCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditRefundAllocationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refund_payment_api_v1_payments__payment_id__refunds_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefundCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefundRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_notifications_api_v1_notifications_me_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyNotifications"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_all_my_notifications_api_v1_notifications_me_read_all_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_notification_api_v1_notifications__notification_id__read_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notification_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_broadcast_api_v1_notifications_broadcast_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BroadcastRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_orders_api_v1_orders_get: {
        parameters: {
            query?: {
                /** @description Uno o varios estados separados por coma. */
                status?: string | null;
                source?: string | null;
                fulfillment_type?: string | null;
                purchase_mode?: string | null;
                payment_status?: string | null;
                q?: string | null;
                created_from?: string | null;
                created_to?: string | null;
                customer_user_id?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_OrderListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    checkout_api_v1_orders_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckoutRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyOrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_my_orders_api_v1_orders_mine_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyOrderRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_my_order_api_v1_orders_mine__order_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyOrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    capture_order_api_v1_orders_capture_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaptureRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    order_status_counts_api_v1_orders_status_counts_get: {
        parameters: {
            query?: {
                source?: string | null;
                fulfillment_type?: string | null;
                purchase_mode?: string | null;
                payment_status?: string | null;
                q?: string | null;
                created_from?: string | null;
                created_to?: string | null;
                customer_user_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: number;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_cancelled_pending_refunds_api_v1_orders_cancellations_pending_refunds_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CancelledWithPaymentItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_order_api_v1_orders__order_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    transition_api_v1_orders__order_id__transition_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderTransitionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    finalize_shipping_api_v1_orders__order_id__shipping_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderShippingFinalizeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_adjustment_api_v1_orders__order_id__adjustments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderAdjustmentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_profile_api_v1_profiles_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProfileSelfRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_my_profile_api_v1_profiles_me_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CustomerProfileSelfUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProfileSelfRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_customers_api_v1_profiles_customers_get: {
        parameters: {
            query?: {
                phone?: string | null;
                q?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProfileRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_customer_profile_api_v1_profiles_customers__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_customer_profile_api_v1_profiles_customers__user_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CustomerProfileUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_staff_profiles_api_v1_profiles_staff_get: {
        parameters: {
            query?: {
                can_deliver?: boolean | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffProfileRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_staff_profile_api_v1_profiles_staff__user_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StaffProfileUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_my_availability_api_v1_profiles_staff_me_availability_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["backend__app__schemas__profile__CourierAvailabilityUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_public_payment_methods_api_v1_payment_methods_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMethodPublic"][];
                };
            };
        };
    };
    list_pos_payment_methods_api_v1_pos_payment_methods_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMethodPublic"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_payment_method_configs_api_v1_payment_method_configs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                available_online?: boolean | null;
                available_pos?: boolean | null;
                requires_manual_verification?: boolean | null;
                code?: string | null;
                display_name?: string | null;
                id_in?: string[] | null;
                display_name_ne?: string | null;
                display_name_contains?: string | null;
                display_name_startswith?: string | null;
                display_name_endswith?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PaymentMethodConfigListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_payment_method_config_api_v1_payment_method_configs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentMethodConfigCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMethodConfigRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_payment_method_config_api_v1_payment_method_configs__method_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                method_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMethodConfigRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_payment_method_config_api_v1_payment_method_configs__method_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                method_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentMethodConfigUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMethodConfigRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_order_payments_api_v1_orders__order_id__payments_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_order_payment_api_v1_orders__order_id__payments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_payment_api_v1_payments__payment_id__verify_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentVerifyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    attach_payment_evidence_api_v1_payments__payment_id__attachments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentAttachmentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_order_ticket_api_v1_orders__order_id__ticket_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_ticket_prints_api_v1_orders__order_id__ticket_prints_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketPrintRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    log_ticket_print_api_v1_orders__order_id__ticket_prints_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TicketPrintCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketPrintRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pos_sale_api_v1_pos_sales_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PosSaleRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PosSaleResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_permissions_api_v1_permissions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PermissionGroupRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_public_business_api_v1_public_business_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicBusinessRead"];
                };
            };
        };
    };
    read_public_legal_terms_api_v1_public_legal_terms_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicLegalTermsRead"];
                };
            };
        };
    };
    read_public_menu_api_v1_public_menu_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicMenuCategory"][];
                };
            };
        };
    };
    quote_public_shipping_api_v1_public_shipping_quote_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublicShippingQuoteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicShippingQuoteResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_public_file_api_v1_public_files__file_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_public_file_api_v1_public_files__file_id__head: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sales_by_hour_api_v1_reports_sales_by_hour_get: {
        parameters: {
            query?: {
                date_from?: string | null;
                date_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesByHourReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    top_products_api_v1_reports_top_products_get: {
        parameters: {
            query?: {
                date_from?: string | null;
                date_to?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopProductsReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_resources_api_v1_resources_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResourceCatalogResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_resource_capability_api_v1_resources__resource_name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                resource_name: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResourceCapability"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_roles_api_v1_roles_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_RoleListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_role_api_v1_roles_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_role_api_v1_roles__role_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_role_api_v1_roles__role_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_role_api_v1_roles__role_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_role_permissions_api_v1_roles__role_id__permissions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RolePermissionsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_role_permissions_api_v1_roles__role_id__permissions_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RolePermissionsReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_zones_api_v1_shipping_zones_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                code?: string | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_DeliveryZoneListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_zone_api_v1_shipping_zones_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeliveryZoneCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryZoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_zone_api_v1_shipping_zones__zone_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zone_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryZoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_zone_api_v1_shipping_zones__zone_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zone_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryZoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_zone_api_v1_shipping_zones__zone_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zone_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeliveryZoneUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryZoneRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_rate_api_v1_shipping_zones__zone_id__rates_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zone_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShippingRateCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShippingRateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    deactivate_rate_api_v1_shipping_rates__rate_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rate_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShippingRateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_rate_api_v1_shipping_rates__rate_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rate_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShippingRateUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShippingRateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_config_api_v1_storefront_config_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StorefrontConfig"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_hero_api_v1_storefront_heros_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HeroWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeroRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_hero_api_v1_storefront_heros__hero_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                hero_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HeroWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeroRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_hero_api_v1_storefront_heros__hero_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                hero_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sort_heros_api_v1_storefront_heros_sort_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HerosSortRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_highlight_api_v1_storefront_highlights_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HighlightWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HighlightRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_highlight_api_v1_storefront_highlights__highlight_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                highlight_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HighlightWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HighlightRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_highlight_api_v1_storefront_highlights__highlight_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                highlight_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_footer_api_v1_storefront_footer_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FooterPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FooterRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_theme_api_v1_storefront_theme_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ThemePatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_site_settings_api_v1_storefront_settings_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SettingsPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    public_site_api_v1_public_storefront_site_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicStorefrontSite"];
                };
            };
        };
    };
    public_highlights_api_v1_public_storefront_highlights_get: {
        parameters: {
            query: {
                surface: "global" | "home" | "login" | "register" | "cart" | "checkout" | "account";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicHighlight"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_system_settings_api_v1_system_settings_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                id_in?: string[] | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_SystemSettingsListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_setup_checklist_api_v1_system_settings_setup_checklist_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SetupChecklistRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dismiss_setup_checklist_api_v1_system_settings_setup_checklist_dismiss_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    domain_challenge_api_v1_domain_challenge__nonce__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                nonce: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_domain_api_v1_system_settings__item_id__verify_domain_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyDomainRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_test_email_api_v1_system_settings__item_id__send_test_email_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendTestEmailRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_system_settings_detail_api_v1_system_settings__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_system_settings_api_v1_system_settings__item_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SystemSettingsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemSettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_profile_api_v1_users_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_profile_api_v1_users_me_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_password_api_v1_users_me_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPasswordChangeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_v1_users_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                email?: string | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                email_ne?: string | null;
                email_contains?: string | null;
                email_startswith?: string | null;
                email_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_UserAdminListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_user_api_v1_users_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAdminCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_user_api_v1_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_api_v1_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_api_v1_users__user_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAdminUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_user_roles_api_v1_users__user_id__roles_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_RoleRead_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_user_roles_api_v1_users__user_id__roles_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserRolesReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    revoke_user_sessions_api_v1_users__user_id__revoke_sessions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
