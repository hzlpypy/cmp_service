CREATE TABLE "REFINER"."api_config"
(
"id" VARCHAR(15) NOT NULL,
"created_at" DATETIME(3) DEFAULT NULL,
"updated_at" DATETIME(3) DEFAULT NULL,
"deleted_at" DATETIME(3) DEFAULT NULL,
"name" VARCHAR(128) NOT NULL,
"PATH" VARCHAR(128) NOT NULL,
"group_id" VARCHAR(50) DEFAULT NULL,
"source_id" VARCHAR(16) NOT NULL,
"desc_" VARCHAR(256) DEFAULT NULL,
"sql_text" TEXT,
"PARAMS" VARCHAR(512),
NOT CLUSTER PRIMARY KEY("id")) STORAGE(ON "REFINER", CLUSTERBTR) ;

CREATE TABLE "REFINER"."api_group"
(
"id" CHAR(15) NOT NULL,
"name" VARCHAR2(64) NOT NULL,
"created_at" TIMESTAMP(3) DEFAULT NULL,
"updated_at" TIMESTAMP(3) DEFAULT NULL,
"deleted_at" TIMESTAMP(3) DEFAULT NULL,
NOT CLUSTER PRIMARY KEY("id")) STORAGE(ON "REFINER", CLUSTERBTR) ;

CREATE UNIQUE  INDEX "idx_unique_name" ON "REFINER"."api_group"("name" ASC) STORAGE(ON "REFINER", CLUSTERBTR) ;

CREATE TABLE "REFINER"."api_sql"
(
"id" VARCHAR2(15) NOT NULL,
"created_at" TIMESTAMP(3),
"updated_at" TIMESTAMP(3),
"deleted_at" TIMESTAMP(3),
"sql_text" CLOB NOT NULL,
"api_config_id" VARCHAR2(15) DEFAULT NULL,
NOT CLUSTER PRIMARY KEY("id"),
CONSTRAINT "fk_api_config_api_sqls" FOREIGN KEY("api_config_id") REFERENCES "REFINER"."api_config"("id")) STORAGE(ON "REFINER", CLUSTERBTR) ;

COMMENT ON COLUMN "REFINER"."api_sql"."api_config_id" IS 'api资源Id';


CREATE  INDEX "idx_api_sql_deleted_at" ON "REFINER"."api_sql"("deleted_at" ASC) STORAGE(ON "REFINER", CLUSTERBTR) ;
CREATE  INDEX "idx_api_sql_api_config_id" ON "REFINER"."api_sql"("api_config_id" ASC) STORAGE(ON "REFINER", CLUSTERBTR) ;

CREATE TABLE "REFINER"."data_source"
(
"id" VARCHAR2(15) NOT NULL,
"created_at" TIMESTAMP(3) DEFAULT NULL,
"updated_at" TIMESTAMP(3) DEFAULT NULL,
"deleted_at" TIMESTAMP(3) DEFAULT NULL,
"types" INTEGER NOT NULL,
"name" VARCHAR2(64) NOT NULL,
"desc_" VARCHAR2(256) DEFAULT NULL,
"host" VARCHAR2(64) NOT NULL,
"port" NUMBER(20,0) DEFAULT NULL,
"user_" VARCHAR2(32) NOT NULL,
"password_" VARCHAR(50) NOT NULL,
"database_" VARCHAR(50) NOT NULL,
NOT CLUSTER PRIMARY KEY("id")) STORAGE(ON "REFINER", CLUSTERBTR) ;

